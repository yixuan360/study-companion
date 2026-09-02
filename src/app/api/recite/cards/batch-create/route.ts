import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { CardType } from "@/generated/prisma/client";

export interface BatchCreateRequest {
  materialId: string;
  cards: {
    type: CardType;
    question: string;
    answer: string;
    hint?: string;
  }[];
}

const VALID_CARD_TYPES: CardType[] = ["cloze", "qa", "judge"];

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as BatchCreateRequest;
    const { materialId, cards } = body;

    if (!materialId || typeof materialId !== "string") {
      return NextResponse.json({ code: 400, data: null, msg: "materialId 不能为空" }, { status: 400 });
    }

    if (!Array.isArray(cards) || cards.length === 0) {
      return NextResponse.json({ code: 400, data: null, msg: "至少选择一张卡片" }, { status: 400 });
    }

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      if (!VALID_CARD_TYPES.includes(card.type)) {
        return NextResponse.json({ code: 400, data: null, msg: `第 ${i + 1} 张卡片题型不合法` }, { status: 400 });
      }
      if (typeof card.question !== "string" || card.question.trim().length === 0) {
        return NextResponse.json({ code: 400, data: null, msg: `第 ${i + 1} 张卡片题目不能为空` }, { status: 400 });
      }
      if (typeof card.answer !== "string" || card.answer.trim().length === 0) {
        return NextResponse.json({ code: 400, data: null, msg: `第 ${i + 1} 张卡片答案不能为空` }, { status: 400 });
      }
    }

    const material = await prisma.material.findUnique({ where: { id: materialId } });
    if (!material) {
      return NextResponse.json({ code: 404, data: null, msg: "材料不存在" }, { status: 404 });
    }

    const { count } = await prisma.card.createMany({
      data: cards.map((card) => ({
        materialId,
        question: card.question.trim(),
        answer: card.answer.trim(),
        hint: card.hint?.trim() || null,
        cardType: card.type,
      })),
    });

    return NextResponse.json({ code: 0, data: { savedCount: count }, msg: "" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[recite/cards/batch-create] failed:", message);
    return NextResponse.json({ code: 500, data: null, msg: message }, { status: 500 });
  }
}
