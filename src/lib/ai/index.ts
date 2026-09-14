import type OpenAI from "openai";
import { prisma } from "@/lib/db";
import { SYSTEM_PROMPT_PREFIX } from "./constants";
import { getModelConfig, type ModelConfig, type TaskType } from "./config";
import { getOpenAIClient } from "./client";

export type { TaskType };

/** OpenAI 兼容的多模态 content part（image_url 传 base64 data URL） */
export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "auto" | "low" | "high" } };

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ChatContentPart[];
}

export interface ChatOptions {
  messages: ChatMessage[];
  taskType: TaskType;
  responseFormat?: "json";
  /** 业务模块标注（制卡/备考计划/图谱抽取…），写入 ApiLog.module 供用量统计 */
  module?: string;
  /** 强制指定提供商（如多模态功能必须走 DeepSeek），缺省按 taskType 路由 */
  provider?: ModelConfig["provider"];
}

export interface ChatUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ChatResult {
  content: string;
  usage: ChatUsage;
  model: string;
  provider: string;
}

const JSON_SYSTEM_APPENDIX =
  "你必须只输出合法 JSON，不要任何解释、不要 markdown 代码块标记（如 ```json），确保输出可直接被 JSON.parse 解析。";

const MAX_RETRIES = 1;
const TIMEOUT_MS = 60_000;

/** system 消息只保留文本：多模态 part（图片等）绝不并入 system 消息 */
function toSystemText(content: string | ChatContentPart[]): string {
  if (typeof content === "string") return content;
  return content
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("\n");
}

function buildMessages(
  messages: ChatMessage[],
  responseFormat?: "json"
): OpenAI.Chat.ChatCompletionMessageParam[] {
  let systemContent = SYSTEM_PROMPT_PREFIX;
  if (responseFormat === "json") {
    systemContent += "\n\n" + JSON_SYSTEM_APPENDIX;
  }

  const result: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemContent },
  ];

  for (const msg of messages) {
    if (msg.role === "system") {
      const existing = result[0].content;
      const extra = toSystemText(msg.content);
      result[0].content =
        typeof existing === "string" ? `${existing}\n\n${extra}` : extra;
    } else {
      result.push(msg as OpenAI.Chat.ChatCompletionMessageParam);
    }
  }

  return result;
}

function parseJSON(raw: string): unknown {
  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `AI response JSON parse failed: ${reason}\n--- Raw content ---\n${raw}`
    );
  }
}

async function callOnce(
  config: ModelConfig,
  messages: OpenAI.Chat.ChatCompletionMessageParam[]
): Promise<{ content: string; usage: ChatUsage; durationMs: number }> {
  const startTime = Date.now();
  const client = getOpenAIClient(config);

  const response = await client.chat.completions.create(
    {
      model: config.model,
      messages,
      stream: false,
    },
    {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }
  );

  const choice = response.choices[0];
  if (!choice) {
    throw new Error("AI provider returned an empty response");
  }

  const content = choice.message.content || "";
  const usage = response.usage ?? {
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
  };

  return {
    content,
    usage: {
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      totalTokens: usage.total_tokens,
    },
    durationMs: Date.now() - startTime,
  };
}

async function logCall(params: {
  config: ModelConfig;
  taskType: TaskType;
  module?: string;
  usage: ChatUsage;
  durationMs: number;
  success: boolean;
  errorMsg?: string;
  attempt: number;
}) {
  try {
    await prisma.apiLog.create({
      data: {
        provider: params.config.provider,
        model: params.config.model,
        taskType: params.taskType,
        module: params.module ?? null,
        promptTokens: params.usage.promptTokens,
        completionTokens: params.usage.completionTokens,
        totalTokens: params.usage.totalTokens,
        durationMs: params.durationMs,
        success: params.success,
        errorMsg: params.errorMsg,
        metadata: { attempt: params.attempt },
      },
    });
  } catch (logErr) {
    console.error("[ai] failed to write api log:", logErr);
  }
}

export async function chat(options: ChatOptions): Promise<ChatResult> {
  const config = getModelConfig(options.taskType, options.provider);
  const messages = buildMessages(options.messages, options.responseFormat);

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { content, usage, durationMs } = await callOnce(config, messages);

      await logCall({
        config,
        taskType: options.taskType,
        module: options.module,
        usage,
        durationMs,
        success: true,
        attempt,
      });

      return {
        content:
          options.responseFormat === "json"
            ? JSON.stringify(parseJSON(content))
            : content,
        usage,
        model: config.model,
        provider: config.provider,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error(
        `[ai] chat failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}):`,
        lastError.message
      );

      if (attempt === MAX_RETRIES) {
        await logCall({
          config,
          taskType: options.taskType,
          module: options.module,
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          durationMs: 0,
          success: false,
          errorMsg: lastError.message,
          attempt,
        });
      }
    }
  }

  throw lastError ?? new Error("AI chat failed after retries");
}
