"use server";

import { prisma } from "@/lib/db";
import { resetCardsProgress } from "@/modules/recite/actions";

export interface MaterialOption {
  id: string;
  title: string;
  cardCount: number;
}

export async function listMaterialsForReset(): Promise<MaterialOption[]> {
  const materials = await prisma.material.findMany({
    orderBy: { createdAt: "desc" },
  });

  const counts = await Promise.all(
    materials.map((m) => prisma.card.count({ where: { materialId: m.id } }))
  );

  return materials.map((m, i) => ({
    id: m.id,
    title: m.title,
    cardCount: counts[i],
  }));
}

export interface ResetTodayResult {
  updatedCount: number;
}

/**
 * 将指定材料的所有卡片 nextReviewAt 重置为现在。
 * 若卡片仍为新卡（mastery=new），会同步设为 learning，使其进入今日待复习队列。
 * 逻辑已抽取到 src/modules/recite/actions.ts，此处仅做转发。
 */
export async function resetTodayCards(materialId: string | "all"): Promise<ResetTodayResult> {
  return resetCardsProgress(materialId);
}
