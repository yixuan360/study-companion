import { prisma } from "@/lib/db";

export interface ReviewStats {
  /** 累计复习次数（ReviewLog 总数） */
  totalReviews: number;
  /** 连续复习天数：从最近有复习记录的日期起向前逐日连续 */
  streakDays: number;
}

/**
 * 统计累计复习次数与连续复习天数。
 * 天数按本地时区的自然日去重，今天未复习时从昨天起算连续天数。
 */
export async function getReviewStats(): Promise<ReviewStats> {
  const logs = await prisma.reviewLog.findMany({
    select: { reviewedAt: true },
    orderBy: { reviewedAt: "desc" },
  });

  const totalReviews = logs.length;
  if (totalReviews === 0) {
    return { totalReviews: 0, streakDays: 0 };
  }

  const daySet = new Set(logs.map((l) => l.reviewedAt.toDateString()));

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const cursor = new Date(today);
  // 今天还没复习，则从昨天开始计算连续天数
  if (!daySet.has(cursor.toDateString())) {
    cursor.setDate(cursor.getDate() - 1);
  }

  let streakDays = 0;
  while (daySet.has(cursor.toDateString())) {
    streakDays += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return { totalReviews, streakDays };
}
