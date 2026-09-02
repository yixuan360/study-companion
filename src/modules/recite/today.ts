import { prisma } from "@/lib/db";
import type { Card } from "@/generated/prisma/client";

export const DAILY_NEW_CARD_LIMIT = 10;

function getEndOfToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999));
}

export interface TodayReviewCards {
  dueCards: Card[];
  newCards: Card[];
  totalCount: number;
}

/**
 * 查询今日待复习卡片。
 * - 已入复习流程且 nextReviewAt 在今天结束前的卡片
 * -  mastery=new 的新卡，每日最多 DAILY_NEW_CARD_LIMIT 张
 */
export async function getTodayReviewCards(): Promise<TodayReviewCards> {
  const endOfToday = getEndOfToday();

  const [dueCards, newCards] = await Promise.all([
    prisma.card.findMany({
      where: {
        mastery: { not: "new" },
        nextReviewAt: { lte: endOfToday },
      },
      orderBy: { nextReviewAt: "asc" },
    }),
    prisma.card.findMany({
      where: { mastery: "new" },
      orderBy: { createdAt: "asc" },
      take: DAILY_NEW_CARD_LIMIT,
    }),
  ]);

  return {
    dueCards,
    newCards,
    totalCount: dueCards.length + newCards.length,
  };
}
