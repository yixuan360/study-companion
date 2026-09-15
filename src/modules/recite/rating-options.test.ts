import { describe, expect, it } from "vitest";
import { buildRatingOptions } from "./rating-options";
import { scheduleReview, type SchedulerCardState } from "./scheduler";

function newCardState(): SchedulerCardState {
  return {
    mastery: "new",
    intervalDays: 0,
    reviewCount: 0,
    lapseCount: 0,
    goodStreak: 0,
  };
}

function learningAt(days: number, streak = 0): SchedulerCardState {
  return {
    mastery: "learning",
    intervalDays: days,
    reviewCount: 1,
    lapseCount: 0,
    goodStreak: streak,
  };
}

function hintsByResult(state: SchedulerCardState): Record<string, string> {
  return Object.fromEntries(buildRatingOptions(state).map((o) => [o.result, o.hint]));
}

describe("buildRatingOptions", () => {
  it("返回四档，顺序为 forgot/hard/good/easy，文案为重来/困难/良好/简单", () => {
    const options = buildRatingOptions(newCardState());
    expect(options.map((o) => o.result)).toEqual(["forgot", "hard", "good", "easy"]);
    expect(options.map((o) => o.label)).toEqual(["重来", "困难", "良好", "简单"]);
  });

  it("新卡四档间隔提示与 scheduler 一致", () => {
    const hints = hintsByResult(newCardState());
    expect(hints.forgot).toBe("明天再见"); // 重置到第 1 档（1 天）
    expect(hints.hard).toBe("明天再见"); // 新卡尚未入档，落到第 1 档（1 天）
    expect(hints.good).toBe("2 天后再见");
    expect(hints.easy).toBe("4 天后再见");
  });

  it("已入档卡片：forgot 重置、hard 保持当前档、good/easy 按阶梯推进", () => {
    const hints = hintsByResult(learningAt(4));
    expect(hints.forgot).toBe("明天再见");
    expect(hints.hard).toBe("4 天后再见");
    expect(hints.good).toBe("7 天后再见");
    expect(hints.easy).toBe("15 天后再见");
  });

  it("阶梯顶档 easy 钳位后提示不超出 30 天", () => {
    const mastered: SchedulerCardState = {
      mastery: "mastered",
      intervalDays: 30,
      reviewCount: 6,
      lapseCount: 0,
      goodStreak: 5,
    };
    const easy = buildRatingOptions(mastered).find((o) => o.result === "easy");
    expect(easy?.hint).toBe("30 天后再见");
  });

  it("提示与 scheduleReview 实际输出逐档一致", () => {
    const state = learningAt(7, 2);
    for (const option of buildRatingOptions(state)) {
      const next = scheduleReview({ ...state, result: option.result });
      const expected = next.intervalDays <= 1 ? "明天再见" : `${next.intervalDays} 天后再见`;
      expect(option.hint).toBe(expected);
    }
  });
});
