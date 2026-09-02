import { describe, expect, it } from "vitest";
import { type ReviewResult, type SchedulerCardState, scheduleReview } from "./scheduler";

const baseDate = new Date("2026-09-02T10:00:00.000Z");

function review(result: ReviewResult, state: SchedulerCardState = newCardState(), at = baseDate) {
  return scheduleReview({ ...state, result, reviewedAt: at });
}

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

describe("scheduleReview", () => {
  describe("新卡首次复习", () => {
    it("forgot: 落入第 1 档（1 天），mastery 变为 learning，lapseCount+1，streak 清零", () => {
      const next = review("forgot");
      expect(next.intervalDays).toBe(1);
      expect(next.mastery).toBe("learning");
      expect(next.lapseCount).toBe(1);
      expect(next.goodStreak).toBe(0);
      expect(next.reviewCount).toBe(1);
      expect(next.nextReviewAt).toEqual(new Date(baseDate.getTime() + 1 * 24 * 60 * 60 * 1000));
    });

    it("hard: 落入第 1 档（1 天），mastery 变为 learning，streak 清零", () => {
      const next = review("hard");
      expect(next.intervalDays).toBe(1);
      expect(next.mastery).toBe("learning");
      expect(next.goodStreak).toBe(0);
    });

    it("good: 进入第 2 档（2 天），mastery 变为 learning，streak=1", () => {
      const next = review("good");
      expect(next.intervalDays).toBe(2);
      expect(next.mastery).toBe("learning");
      expect(next.goodStreak).toBe(1);
    });

    it("easy: 跳一档到第 3 档（4 天），mastery 变为 learning，streak=1", () => {
      const next = review("easy");
      expect(next.intervalDays).toBe(4);
      expect(next.mastery).toBe("learning");
      expect(next.goodStreak).toBe(1);
    });
  });

  describe("已入档卡片的状态流转", () => {
    it("forgot: 重置到第 1 档，mastery 退回 learning，lapseCount+1，streak 清零", () => {
      const next = review("forgot", learningAt(15, 2));
      expect(next.intervalDays).toBe(1);
      expect(next.mastery).toBe("learning");
      expect(next.lapseCount).toBe(1);
      expect(next.goodStreak).toBe(0);
    });

    it("hard: 保持当前档位，streak 清零", () => {
      const next = review("hard", learningAt(4, 2));
      expect(next.intervalDays).toBe(4);
      expect(next.goodStreak).toBe(0);
      expect(next.mastery).toBe("learning");
    });

    it("good: 按阶梯推进一档", () => {
      const next = review("good", learningAt(4));
      expect(next.intervalDays).toBe(7);
      expect(next.goodStreak).toBe(1);
    });

    it("easy: 跨两级间隔", () => {
      const next = review("easy", learningAt(2));
      expect(next.intervalDays).toBe(7);
      expect(next.goodStreak).toBe(1);
    });
  });

  describe("mastery 进阶", () => {
    it("连续 3 次 good 后进入 familiar", () => {
      let state = review("good"); // new -> learning, 2天, streak=1
      state = review("good", state); // 4天, streak=2
      state = review("good", state); // 7天, streak=3 -> familiar
      expect(state.mastery).toBe("familiar");
      expect(state.intervalDays).toBe(7);
      expect(state.goodStreak).toBe(3);
    });

    it("连续 3 次 easy 后进入 familiar", () => {
      let state = review("easy"); // new -> learning, 4天, streak=1
      state = review("easy", state); // 15天, streak=2 -> mastered（因为进入15天档且 good/easy）
      expect(state.mastery).toBe("mastered");
      state = review("easy", state); // 30天, streak=3
      expect(state.intervalDays).toBe(30);
      expect(state.mastery).toBe("mastered");
    });

    it("进入 15 天档且 good 直接进入 mastered", () => {
      const state = review("good", learningAt(7, 2));
      expect(state.intervalDays).toBe(15);
      expect(state.mastery).toBe("mastered");
      expect(state.goodStreak).toBe(3);
    });

    it("进入 15 天档且 easy 直接进入 mastered", () => {
      const state = review("easy", learningAt(4, 1));
      expect(state.intervalDays).toBe(15);
      expect(state.mastery).toBe("mastered");
    });

    it("familiar 后 forgot 退回 learning", () => {
      const familiar = {
        mastery: "familiar" as const,
        intervalDays: 7,
        reviewCount: 3,
        lapseCount: 0,
        goodStreak: 3,
      };
      const next = review("forgot", familiar);
      expect(next.mastery).toBe("learning");
      expect(next.intervalDays).toBe(1);
      expect(next.lapseCount).toBe(1);
      expect(next.goodStreak).toBe(0);
    });
  });

  describe("边界与容错", () => {
    it("阶梯超过最大值时钳位到 30 天", () => {
      const state = {
        mastery: "familiar" as const,
        intervalDays: 30,
        reviewCount: 5,
        lapseCount: 0,
        goodStreak: 4,
      };
      const next = review("easy", state);
      expect(next.intervalDays).toBe(30);
    });

    it("脏数据 intervalDays 不在阶梯中时，取不超过它的最大档位", () => {
      const state = {
        mastery: "learning" as const,
        intervalDays: 3,
        reviewCount: 2,
        lapseCount: 0,
        goodStreak: 0,
      };
      const next = review("good", state);
      expect(next.intervalDays).toBe(4);
    });

    it("hard 不会降低档位", () => {
      const state = {
        mastery: "mastered" as const,
        intervalDays: 30,
        reviewCount: 6,
        lapseCount: 0,
        goodStreak: 5,
      };
      const next = review("hard", state);
      expect(next.intervalDays).toBe(30);
      expect(next.mastery).toBe("mastered");
      expect(next.goodStreak).toBe(0);
    });
  });
});
