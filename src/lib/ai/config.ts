export type TaskType = "simple" | "complex";

export interface ModelConfig {
  provider: "deepseek" | "kimi";
  apiKey: string;
  baseURL: string;
  model: string;
}

export function getModelConfig(taskType: TaskType): ModelConfig {
  if (taskType === "complex") {
    const kimiKey = process.env.KIMI_API_KEY;
    if (kimiKey) {
      return {
        provider: "kimi",
        apiKey: kimiKey,
        baseURL: process.env.KIMI_BASE_URL || "https://api.moonshot.cn",
        model: process.env.KIMI_MODEL || "moonshot-v1-8k",
      };
    }

    console.warn(
      "[ai] KIMI_API_KEY is not set, falling back to DeepSeek for complex task"
    );
  }

  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  if (!deepseekKey) {
    throw new Error("Missing DEEPSEEK_API_KEY environment variable");
  }

  return {
    provider: "deepseek",
    apiKey: deepseekKey,
    baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
    model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
  };
}
