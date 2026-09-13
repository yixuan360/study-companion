import { describe, expect, it } from "vitest";
import { matchesSchedule } from "./schedule-lib.mts";

describe("matchesSchedule", () => {
  // 2026-09-13 是周日
  const sunday0830 = new Date(2026, 8, 13, 8, 30, 0);
  const sunday0800 = new Date(2026, 8, 13, 8, 0, 0);
  const monday0800 = new Date(2026, 8, 14, 8, 0, 0);

  it("时分匹配且无星期限制时命中", () => {
    expect(matchesSchedule({ hour: 8, minute: 0 }, sunday0800)).toBe(true);
  });

  it("分钟不匹配时不命中", () => {
    expect(matchesSchedule({ hour: 8, minute: 0 }, sunday0830)).toBe(false);
  });

  it("weekday 限制：周日任务周日命中、周一不命中", () => {
    const entry = { hour: 21, minute: 0, weekday: 0 };
    expect(matchesSchedule(entry, new Date(2026, 8, 13, 21, 0, 0))).toBe(true);
    expect(matchesSchedule(entry, new Date(2026, 8, 14, 21, 0, 0))).toBe(false);
  });

  it("weekday 用本地时间 getDay()", () => {
    expect(monday0800.getDay()).toBe(1);
    expect(matchesSchedule({ hour: 8, minute: 0, weekday: 1 }, monday0800)).toBe(true);
  });
});
