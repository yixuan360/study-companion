import { prisma } from "@/lib/db";
import type { Card, Material, Prisma } from "@/generated/prisma/client";

export const DEFAULT_DAILY_NEW_CARD_LIMIT = 10;

export interface GetTodayReviewCardsOptions {
  /** 仅返回指定材料的卡片 */
  materialId?: string;
  /** 每日新卡上限，默认 10 */
  dailyNewCardLimit?: number;
}

function getEndOfToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999));
}

export interface TodayReviewCards {
  dueCards: Card[];
  newCards: Card[];
  totalCount: number;
  materials: Record<string, Material>;
}

/**
 * 查询今日待复习卡片。
 * - 已入复习流程且 nextReviewAt 在今天结束前的卡片
 * - mastery=new 的新卡，每日上限由 dailyNewCardLimit 控制
 *
 * 同时返回卡片所属材料映射，便于复习页展示原文上下文。
 */
export async function getTodayReviewCards(options: GetTodayReviewCardsOptions = {}): Promise<TodayReviewCards> {
  const { materialId, dailyNewCardLimit = DEFAULT_DAILY_NEW_CARD_LIMIT } = options;
  const endOfToday = getEndOfToday();

  const materialFilter: Prisma.CardWhereInput = materialId ? { materialId } : {};

  const [dueCards, newCards] = await Promise.all([
    prisma.card.findMany({
      where: {
        ...materialFilter,
        mastery: { not: "new" },
        nextReviewAt: { lte: endOfToday },
      },
      orderBy: { nextReviewAt: "asc" },
    }),
    prisma.card.findMany({
      where: {
        ...materialFilter,
        mastery: "new",
      },
      orderBy: { createdAt: "asc" },
      take: dailyNewCardLimit,
    }),
  ]);

  const allCards = [...dueCards, ...newCards];
  const materialIds = [...new Set(allCards.map((c) => c.materialId))];
  const materials = await prisma.material.findMany({
    where: { id: { in: materialIds } },
  });

  return {
    dueCards,
    newCards,
    totalCount: allCards.length,
    materials: Object.fromEntries(materials.map((m) => [m.id, m])),
  };
}
