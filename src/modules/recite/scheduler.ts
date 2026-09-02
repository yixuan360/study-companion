/**
 * 艾宾浩斯间隔重复调度器
 *
 * 纯函数，输入卡片当前状态与自评结果，输出下一次复习状态。
 * 便于单元测试，不依赖 Prisma 或任何外部状态。
 */

export const INTERVAL_LADDER: number[] = [1, 2, 4, 7, 15, 30];

export type ReviewResult = "forgot" | "hard" | "good" | "easy";
export type MasteryLevel = "new" | "learning" | "familiar" | "mastered";

export interface SchedulerCardState {
  mastery: MasteryLevel;
  intervalDays: number;
  reviewCount: number;
  lapseCount: number;
  goodStreak: number;
}

export interface ScheduleReviewInput extends SchedulerCardState {
  result: ReviewResult;
  reviewedAt?: Date;
}

export interface ScheduleReviewOutput extends SchedulerCardState {
  nextReviewAt: Date;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * 根据当前 intervalDays 找到它在阶梯中的档位。
 * - 0 或未复习过的卡片视为位于第 1 档（1 天）起点，返回 0。
 * - 不在阶梯中的脏数据取不超过当前值的最大档位。
 * - 大于最大档位的值会被钳位到最大档位。
 */
function getIntervalIndex(intervalDays: number): number {
  if (intervalDays <= 0) return 0;

  const exactIndex = INTERVAL_LADDER.indexOf(intervalDays);
  if (exactIndex !== -1) return exactIndex;

  // 脏数据：取不超过当前值的最大档位
  for (let i = INTERVAL_LADDER.length - 1; i >= 0; i--) {
    if (INTERVAL_LADDER[i] < intervalDays) return i;
  }
  return 0;
}

/**
 * 计算一次复习后的新状态。
 */
export function scheduleReview(input: ScheduleReviewInput): ScheduleReviewOutput {
  const { result } = input;

  let mastery = input.mastery;
  let intervalDays = input.intervalDays;
  const reviewCount = input.reviewCount + 1;
  let lapseCount = input.lapseCount;
  let goodStreak = input.goodStreak;

  const currentIndex = getIntervalIndex(intervalDays);
  let nextIndex: number;

  switch (result) {
    case "forgot": {
      nextIndex = 0;
      lapseCount += 1;
      mastery = "learning";
      goodStreak = 0;
      break;
    }
    case "hard": {
      // 保持当前档位；新卡尚未入档时落到第 1 档
      nextIndex = Math.max(0, currentIndex);
      goodStreak = 0;
      break;
    }
    case "good": {
      nextIndex = currentIndex + 1;
      goodStreak += 1;
      break;
    }
    case "easy": {
      nextIndex = currentIndex + 2;
      goodStreak += 1;
      break;
    }
  }

  nextIndex = Math.max(0, Math.min(nextIndex, INTERVAL_LADDER.length - 1));
  intervalDays = INTERVAL_LADDER[nextIndex];

  // 首次复习后脱离 new
  if (input.mastery === "new") {
    mastery = "learning";
  }

  // 连续 3 次 good/easy 进入 familiar
  if (goodStreak >= 3 && mastery !== "mastered") {
    mastery = "familiar";
  }

  // 进入 15 天档且本次为 good/easy 进入 mastered
  if (intervalDays === 15 && (result === "good" || result === "easy") && mastery !== "mastered") {
    mastery = "mastered";
  }

  const reviewedAt = input.reviewedAt ?? new Date();
  const nextReviewAt = new Date(reviewedAt.getTime() + intervalDays * MS_PER_DAY);

  return {
    mastery,
    intervalDays,
    reviewCount,
    lapseCount,
    goodStreak,
    nextReviewAt,
  };
}
