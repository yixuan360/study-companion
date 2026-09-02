import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { chat } from "@/lib/ai";

const MAX_CONTENT_LENGTH = 8000;

export interface GenerateCardsRequest {
  title: string;
  content: string;
}

export interface GeneratedCard {
  type: "cloze" | "qa" | "judge";
  question: string;
  answer: string;
  hint?: string;
}

function buildPrompt(content: string): string {
  return `你是学习卡片制作专家。将以下学习材料拆解为原子知识点，每个知识点生成一张记忆卡。
要求：
1. 一张卡只考一个知识点，问题明确无歧义
2. 题型分布：优先挖空题（cloze，针对关键概念/定义/公式/结论），其次简答题（qa），判断题（judge）少量
3. 挖空题用 ____ 表示空缺处
4. 忽略页码、装饰性文字
5. 输出严格 JSON：{"cards":[{"type":"cloze|qa|judge","question":"...","answer":"...","hint":"一句话提示，可省略"}]}
材料：
"""
${content}
"""`;
}

function parseCards(raw: unknown): GeneratedCard[] {
  if (typeof raw !== "object" || raw === null || !("cards" in raw)) {
    throw new Error("AI 返回格式错误，缺少 cards 字段");
  }
  const cards = (raw as { cards: unknown[] }).cards;
  if (!Array.isArray(cards)) {
    throw new Error("AI 返回的 cards 不是数组");
  }
  return cards.map((card, index) => {
    if (
      typeof card !== "object" ||
      card === null ||
      typeof (card as GeneratedCard).type !== "string" ||
      typeof (card as GeneratedCard).question !== "string" ||
      typeof (card as GeneratedCard).answer !== "string"
    ) {
      throw new Error(`第 ${index + 1} 张卡片字段不完整`);
    }
    return card as GeneratedCard;
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as GenerateCardsRequest;
    const title = body.title?.trim();
    const content = body.content?.trim();

    if (!title) {
      return NextResponse.json({ code: 400, data: null, msg: "标题不能为空" }, { status: 400 });
    }
    if (!content) {
      return NextResponse.json({ code: 400, data: null, msg: "内容不能为空" }, { status: 400 });
    }

    let truncated = false;
    let processedContent = content;
    if (content.length > MAX_CONTENT_LENGTH) {
      processedContent = content.slice(0, MAX_CONTENT_LENGTH);
      truncated = true;
    }

    const material = await prisma.material.create({
      data: {
        title,
        sourceType: "text",
        rawContent: processedContent,
      },
    });

    const result = await chat({
      messages: [{ role: "user", content: buildPrompt(processedContent) }],
      taskType: "simple",
      responseFormat: "json",
    });

    const cards = parseCards(JSON.parse(result.content));

    return NextResponse.json({
      code: 0,
      data: {
        materialId: material.id,
        cards,
        usage: result.usage,
        model: result.model,
        provider: result.provider,
      },
      msg: truncated ? "内容较长，已截断前 8000 字符，建议分段录入" : "",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[recite/generate-cards] failed:", message);
    return NextResponse.json({ code: 500, data: null, msg: message }, { status: 500 });
  }
}
