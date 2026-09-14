/**
 * 模型价格表：单位为 元 / 百万 token。
 * 价格来源为各服务商官网公开价（2026-09 查询值），仅用于本地估算，
 * 厂商调价后请更新此处；实际账单以服务商控制台为准。
 */
export interface ModelPrice {
  /** 输入（prompt）每百万 token 单价，元 */
  input: number;
  /** 输出（completion）每百万 token 单价，元 */
  output: number;
}

export const MODEL_PRICING: Record<string, ModelPrice> = {
  "deepseek-chat": { input: 2, output: 8 },
  // V4.1 Flash 取高峰时段价（缓存未命中），空闲时段半价，实际更低
  "deepseek-flash": { input: 2, output: 8 },
  "moonshot-v1-8k": { input: 12, output: 12 },
};

/** 未登记模型按此价估算（保守取 deepseek-chat 价） */
export const FALLBACK_PRICING: ModelPrice = MODEL_PRICING["deepseek-chat"];

export function estimateCost(
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  const price = MODEL_PRICING[model] ?? FALLBACK_PRICING;
  return (promptTokens / 1_000_000) * price.input + (completionTokens / 1_000_000) * price.output;
}
