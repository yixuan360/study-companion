"use server";

import { prisma } from "@/lib/db";
import { sendDailyReviewReminder, type ReminderResult } from "./reminder";

export interface ResetProgressResult {
  updatedCount: number;
}

/**
 * 将指定材料（或全部材料）的卡片 nextReviewAt 重置为现在。
 * 若卡片仍为新卡（mastery=new），会同步设为 learning，使其进入今日待复习队列。
 */
export async function resetCardsProgress(materialId: string | "all"): Promise<ResetProgressResult> {
  const now = new Date();

  if (materialId === "all") {
    const [dueUpdated] = await Promise.all([
      prisma.card.updateMany({
        data: { nextReviewAt: now },
      }),
      prisma.card.updateMany({
        where: { mastery: "new" },
        data: { mastery: "learning" },
      }),
    ]);
    return { updatedCount: dueUpdated.count };
  }

  const [dueUpdated] = await Promise.all([
    prisma.card.updateMany({
      where: { materialId },
      data: { nextReviewAt: now },
    }),
    prisma.card.updateMany({
      where: { materialId, mastery: "new" },
      data: { mastery: "learning" },
    }),
  ]);

  return { updatedCount: dueUpdated.count };
}

/** 手动触发一次「今日待复习」推送提醒。 */
export async function sendDailyReminderAction(): Promise<ReminderResult> {
  return sendDailyReviewReminder();
}
