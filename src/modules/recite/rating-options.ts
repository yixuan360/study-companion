/**
 * 四档自评选项组装（纯函数）
 *
 * 复习页自评按钮的文案与「下次复习间隔」提示统一从这里取，
 * 保证按钮展示与 scheduler.ts 的调度结果一致。
 */

import { scheduleReview, type ReviewResult, type SchedulerCardState } from "./scheduler";

export interface RatingOption {
  result: ReviewResult;
  label: string;
  /** 下次复习间隔提示，如「明天再见」「4 天后再见」 */
  hint: string;
}

export const RATING_LABELS: Record<ReviewResult, string> = {
  forgot: "重来",
  hard: "困难",
  good: "良好",
  easy: "简单",
};

/** 展示顺序：从最消极到最积极 */
const RATING_ORDER: ReviewResult[] = ["forgot", "hard", "good", "easy"];

function formatNextInterval(intervalDays: number): string {
  return intervalDays <= 1 ? "明天再见" : `${intervalDays} 天后再见`;
}

/**
 * 根据卡片当前状态生成四档自评按钮的展示数据，
 * 每档提示语来自 scheduleReview 的真实输出。
 */
export function buildRatingOptions(card: SchedulerCardState): RatingOption[] {
  return RATING_ORDER.map((result) => {
    const next = scheduleReview({ ...card, result });
    return {
      result,
      label: RATING_LABELS[result],
      hint: formatNextInterval(next.intervalDays),
    };
  });
}
