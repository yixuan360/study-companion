/**
 * 三段式实体对齐的候选召回层（第 1 段；第 2 段规则过滤、第 3 段 AI 裁决在 ingest.ts）。
 *
 * 召回结果与规则命中（name 精确 / 别名精确 / name 双向包含）取并集后进 AI 裁决，
 * 召回率不低于原两段式；候选集被截断在 top-K，AI Prompt 大小与节点总量解耦。
 *
 * 两种召回方式：
 * - embedding：配置 EMBEDDING_BASE_URL/EMBEDDING_API_KEY/EMBEDDING_MODEL（OpenAI 兼容）
 *   时启用，余弦相似度 top-K；节点向量存 GraphNode.metadata（无需 migration），
 *   入库时惰性回填（embed 调用经 src/lib/ai/embed.ts 网关，失败自动降级）；
 * - 字符 n-gram 兜底：无 embedding 服务的本地纯函数路径，中英文混合分词。
 */

/** 每种实体进入 AI 裁决的候选上限（规则命中 + 召回并集后按规则优先截断） */
export const RECALL_TOP_K = 15;
/** n-gram 兜底召回的最小余弦相似度（低于该值视为噪音候选，不进并集） */
export const NGRAM_MIN_SCORE = 0.25;
/** embedding 召回的最小余弦相似度 */
export const EMBED_MIN_SCORE = 0.6;

export interface RecallQuery {
  name: string;
  aliases: string[];
}

export interface RecallableNode {
  id: string;
  name: string;
  aliases: string[];
  /** embedding 召回用；存于 GraphNode.metadata.embedding */
  embedding?: number[] | null;
  /** 产出该向量的模型名；与当前配置不一致时视为失效，触发回填 */
  embeddingModel?: string | null;
}

export interface RecallHit<T extends RecallableNode = RecallableNode> {
  node: T;
  score: number;
}

export interface EmbeddingRecallDeps {
  model: string;
  embedTexts: (texts: string[]) => Promise<number[][]>;
}

/** 实体/节点参与向量化的文本：主名 + 别名 */
export function embedTextOf(item: { name: string; aliases: string[] }): string {
  return [item.name, ...item.aliases].join(" ").trim();
}

// ---------------- 字符 n-gram 兜底（纯函数） ----------------

const TOKEN_RUN = /[a-z0-9]+|[㐀-䶿一-鿿豈-﫿]+/g;

/**
 * 中英文混合分词：
 * - 中文（CJK）连续段按字切 bigram，单字退化为 unigram；
 * - 英文/数字段先整词入袋，再补词内字符 bigram（容忍词形变化与轻微拼写差）。
 */
export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  for (const run of text.toLowerCase().matchAll(TOKEN_RUN)) {
    const s = run[0];
    if (/^[㐀-䶿一-鿿豈-﫿]/.test(s)) {
      if (s.length === 1) {
        tokens.push(s);
      } else {
        for (let i = 0; i + 1 < s.length; i++) tokens.push(s.slice(i, i + 2));
      }
    } else {
      tokens.push(s);
      for (let i = 0; i + 1 < s.length; i++) tokens.push(s.slice(i, i + 2));
    }
  }
  return tokens;
}

function docTokens(item: { name: string; aliases: string[] }): string[] {
  return [item.name, ...item.aliases].flatMap(tokenize);
}

/**
 * 整词权重：英文/数字整词（长度 ≥3 的 ASCII token 必为整词）比字符 bigram 重要，
 * 让共享缩写/别名（如 CNN）足以越过召回阈值，而单个弱共现 bigram 越不过。
 */
const WORD_WEIGHT = 2;

function tokenWeight(token: string): number {
  return token.length >= 3 && /^[a-z0-9]+$/.test(token) ? WORD_WEIGHT : 1;
}

/** 集合语义词袋（短实体名场景比 TF 稳：英文词内重复 bigram 不累积范数） */
function toVector(tokens: string[]): Map<string, number> {
  const vec = new Map<string, number>();
  for (const t of tokens) vec.set(t, tokenWeight(t));
  return vec;
}

/** 稀疏向量余弦相似度（0~1；空向量任一侧返回 0） */
export function cosineSimilarity(
  a: Map<string, number>,
  b: Map<string, number>
): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const v of a.values()) normA += v * v;
  for (const v of b.values()) normB += v * v;
  if (normA === 0 || normB === 0) return 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const [key, v] of small) {
    const w = large.get(key);
    if (w) dot += v * w;
  }
  return dot / Math.sqrt(normA * normB);
}

/**
 * n-gram 余弦召回 top-K。复杂度 O(N·d)（N=节点数，d=平均词袋大小），
 * 1000+ 节点单次召回毫秒级。得分相同时按节点 id 排序，保证结果确定性。
 */
export function recallByNGram<T extends RecallableNode>(
  query: RecallQuery,
  nodes: T[],
  options: { topK?: number; minScore?: number } = {}
): RecallHit<T>[] {
  const { topK = RECALL_TOP_K, minScore = NGRAM_MIN_SCORE } = options;
  const qVec = toVector(docTokens(query));
  return nodes
    .map((node) => ({
      node,
      score: cosineSimilarity(qVec, toVector(docTokens(node))),
    }))
    .filter((h) => h.score >= minScore)
    .sort(
      (a, b) => b.score - a.score || a.node.id.localeCompare(b.node.id)
    )
    .slice(0, topK);
}

// ---------------- embedding 召回（有外部服务时优先） ----------------

function isUsableEmbedding(
  node: RecallableNode,
  model: string
): node is RecallableNode & { embedding: number[] } {
  return (
    Array.isArray(node.embedding) &&
    node.embedding.length > 0 &&
    node.embedding.every((v) => typeof v === "number" && Number.isFinite(v)) &&
    node.embeddingModel === model
  );
}

function cosineOfVectors(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * 统一召回入口：提供了 embed 依赖且库内已有同模型向量时走向量余弦 top-K；
 * 否则退回 n-gram 兜底。调用方（ingest.ts）负责向量回填与失败降级。
 */
export async function recallCandidates<T extends RecallableNode>(
  query: RecallQuery,
  nodes: T[],
  embed?: EmbeddingRecallDeps
): Promise<RecallHit<T>[]> {
  if (embed) {
    const usable = nodes.filter((n) => isUsableEmbedding(n, embed.model));
    if (usable.length > 0) {
      const [queryVec] = await embed.embedTexts([embedTextOf(query)]);
      if (Array.isArray(queryVec) && queryVec.length > 0) {
        return usable
          .map((node) => ({
            node,
            score: cosineOfVectors(queryVec, node.embedding as number[]),
          }))
          .filter((h) => h.score >= EMBED_MIN_SCORE)
          .sort(
            (a, b) => b.score - a.score || a.node.id.localeCompare(b.node.id)
          )
          .slice(0, RECALL_TOP_K);
      }
    }
  }
  return recallByNGram(query, nodes);
}
