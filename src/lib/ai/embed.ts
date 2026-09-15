import { prisma } from "@/lib/db";
import { getOpenAIClient } from "./client";

/**
 * OpenAI 兼容 embedding 网关（图谱候选召回等场景）。
 * 环境变量 EMBEDDING_BASE_URL / EMBEDDING_API_KEY / EMBEDDING_MODEL 三者齐备才启用；
 * 未配置时 getEmbeddingConfig() 返回 null，调用方走本地兜底（如 n-gram）。
 */

export interface EmbeddingConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

const TIMEOUT_MS = 60_000;
/** 单次请求最大文本数（OpenAI 兼容接口普遍限制 input 条数） */
const BATCH_SIZE = 64;

export function getEmbeddingConfig(): EmbeddingConfig | null {
  const { EMBEDDING_BASE_URL, EMBEDDING_API_KEY, EMBEDDING_MODEL } = process.env;
  if (!EMBEDDING_BASE_URL || !EMBEDDING_API_KEY || !EMBEDDING_MODEL) return null;
  return {
    baseUrl: EMBEDDING_BASE_URL,
    apiKey: EMBEDDING_API_KEY,
    model: EMBEDDING_MODEL,
  };
}

/** 批量文本转向量；分批请求，写 ApiLog（provider=embedding），失败抛错由调用方降级 */
export async function embedTexts(params: {
  texts: string[];
  module: string;
}): Promise<number[][]> {
  const config = getEmbeddingConfig();
  if (!config) {
    throw new Error("未配置 EMBEDDING_BASE_URL/EMBEDDING_API_KEY/EMBEDDING_MODEL");
  }
  const client = getOpenAIClient({ apiKey: config.apiKey, baseURL: config.baseUrl });
  const vectors: number[][] = [];
  const start = Date.now();
  let success = true;
  let errorMsg: string | null = null;
  try {
    for (let i = 0; i < params.texts.length; i += BATCH_SIZE) {
      const batch = params.texts.slice(i, i + BATCH_SIZE);
      const res = await client.embeddings.create(
        { model: config.model, input: batch },
        { signal: AbortSignal.timeout(TIMEOUT_MS) }
      );
      for (const d of res.data) vectors.push(d.embedding);
    }
  } catch (err) {
    success = false;
    errorMsg = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    try {
      await prisma.apiLog.create({
        data: {
          provider: "embedding",
          model: config.model,
          taskType: "embedding",
          module: params.module,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          durationMs: Date.now() - start,
          success,
          errorMsg,
          metadata: { count: params.texts.length },
        },
      });
    } catch (logErr) {
      console.error("[ai] failed to write embedding api log:", logErr);
    }
  }
  return vectors;
}
