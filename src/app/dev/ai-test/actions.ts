"use server";

import { chat } from "@/lib/ai";

export interface ExtractResult {
  content: unknown;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  provider: string;
}

export async function extractKeyPoints(text: string): Promise<ExtractResult> {
  const result = await chat({
    messages: [
      {
        role: "user",
        content: `请从以下文本中提取 3-5 个核心要点，返回 JSON 数组。每个要点包含 title（标题，不超过 10 字）和 summary（摘要，不超过 50 字）。\n\n文本：\n${text}`,
      },
    ],
    taskType: "simple",
    responseFormat: "json",
  });

  return {
    content: JSON.parse(result.content),
    usage: result.usage,
    model: result.model,
    provider: result.provider,
  };
}
