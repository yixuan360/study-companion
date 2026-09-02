import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { scheduleReview, type ReviewResult as SchedulerReviewResult } from "@/modules/recite/scheduler";
import type { ReviewResult } from "@/generated/prisma/client";

const VALID_RESULTS: ReviewResult[] = ["forgot", "hard", "good", "easy"];

export interface ReviewRequest {
  cardId: string;
  result: ReviewResult;
  userAnswer?: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ReviewRequest;
    const { cardId, result, userAnswer } = body;

    if (!cardId || typeof cardId !== "string") {
      return NextResponse.json({ code: 400, data: null, msg: "cardId 不能为空" }, { status: 400 });
    }

    if (!VALID_RESULTS.includes(result)) {
      return NextResponse.json(
        { code: 400, data: null, msg: "result 必须是 forgot/hard/good/easy 之一" },
        { status: 400 }
      );
    }

    const card = await prisma.card.findUnique({ where: { id: cardId } });
    if (!card) {
      return NextResponse.json({ code: 404, data: null, msg: "卡片不存在" }, { status: 404 });
    }

    const update = scheduleReview({
      mastery: card.mastery,
      intervalDays: card.intervalDays,
      reviewCount: card.reviewCount,
      lapseCount: card.lapseCount,
      goodStreak: card.goodStreak,
      result: result as SchedulerReviewResult,
    });

    const [updatedCard] = await prisma.$transaction([
      prisma.card.update({
        where: { id: cardId },
        data: {
          mastery: update.mastery,
          intervalDays: update.intervalDays,
          nextReviewAt: update.nextReviewAt,
          reviewCount: update.reviewCount,
          lapseCount: update.lapseCount,
          goodStreak: update.goodStreak,
        },
      }),
      prisma.reviewLog.create({
        data: {
          cardId,
          result,
          userAnswer: userAnswer?.trim() || null,
        },
      }),
    ]);

    return NextResponse.json({ code: 0, data: { card: updatedCard }, msg: "" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[recite/review] failed:", message);
    return NextResponse.json({ code: 500, data: null, msg: message }, { status: 500 });
  }
}
