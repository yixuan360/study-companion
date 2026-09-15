import { describe, expect, it } from "vitest";
import {
  buildGoalDetail,
  buildPhaseRows,
  buildReportRows,
  normalizeRiskLevel,
  type GoalDetailPhaseInput,
  type GoalDetailReportInput,
  type GoalDetailTaskStatInput,
} from "./goal-detail";

function date(s: string): Date {
  return new Date(`${s}T00:00:00`);
}

const TODAY = date("2026-09-15");

function makePhase(overrides: Partial<GoalDetailPhaseInput> = {}): GoalDetailPhaseInput {
  return {
    id: "p1",
    name: "基础轮",
    focus: "过一遍教材",
    order: 1,
    startDate: date("2026-09-01"),
    endDate: date("2026-09-30"),
    metadata: { exitCriteria: "完成教材第一遍" },
    ...overrides,
  };
}

function makeTaskStats(): GoalDetailTaskStatInput[] {
  return [
    { phaseId: "p1", status: "done" },
    { phaseId: "p1", status: "done" },
    { phaseId: "p1", status: "skipped" },
    { phaseId: "p2", status: "pending" },
    { phaseId: null, status: "done" },
  ];
}

describe("buildPhaseRows", () => {
  it("按 order 排序，完成度只统计 done（skipped 不算），并提取结束标志", () => {
    const rows = buildPhaseRows(
      [
        makePhase({ id: "p2", order: 2, startDate: date("2026-10-01"), endDate: date("2026-10-31") }),
        makePhase(),
      ],
      makeTaskStats(),
      TODAY
    );
    expect(rows.map((r) => r.id)).toEqual(["p1", "p2"]);
    expect(rows[0].total).toBe(3);
    expect(rows[0].done).toBe(2);
    expect(rows[0].percent).toBe(67);
    expect(rows[0].exitCriteria).toBe("完成教材第一遍");
    expect(rows[1].total).toBe(1);
    expect(rows[1].done).toBe(0);
  });

  it("时间线状态：当前高亮、已结束、未开始", () => {
    const rows = buildPhaseRows(
      [
        makePhase({ id: "past", startDate: date("2026-08-01"), endDate: date("2026-08-31") }),
        makePhase({ id: "current" }),
        makePhase({ id: "next", startDate: date("2026-10-01"), endDate: date("2026-10-31") }),
      ],
      [],
      TODAY
    );
    expect(rows.map((r) => [r.id, r.timing, r.isCurrent])).toEqual([
      ["past", "past", false],
      ["current", "current", true],
      ["next", "upcoming", false],
    ]);
  });

  it("无任务阶段完成度为 0，缺失 metadata 不报错", () => {
    const rows = buildPhaseRows([makePhase({ metadata: null })], [], TODAY);
    expect(rows[0].percent).toBe(0);
    expect(rows[0].exitCriteria).toBe("");
  });
});

describe("buildReportRows", () => {
  function makeReport(overrides: Partial<GoalDetailReportInput> = {}): GoalDetailReportInput {
    return {
      id: "r1",
      weekStart: date("2026-09-08"),
      completionRate: 66.7,
      aiSummary: "总结",
      adjustments: "建议",
      metadata: { riskLevel: "high" },
      createdAt: date("2026-09-14"),
      ...overrides,
  };
  }

  it("按 weekStart 倒序，完成率取整，提取风险等级", () => {
    const rows = buildReportRows([
      makeReport({ id: "old", weekStart: date("2026-09-01") }),
      makeReport(),
    ]);
    expect(rows.map((r) => r.id)).toEqual(["r1", "old"]);
    expect(rows[0].completionRate).toBe(67);
    expect(rows[0].riskLevel).toBe("high");
    expect(rows[0].weekLabel).toBe("09/08 当周");
  });

  it("metadata 缺 riskLevel 或非法值时回退 low", () => {
    const rows = buildReportRows([
      makeReport({ id: "no-meta", metadata: null }),
      makeReport({ id: "bad-meta", metadata: { riskLevel: "extreme" } }),
    ]);
    expect(rows.find((r) => r.id === "no-meta")!.riskLevel).toBe("low");
    expect(rows.find((r) => r.id === "bad-meta")!.riskLevel).toBe("low");
  });
});

describe("normalizeRiskLevel", () => {
  it("只接受 low/medium/high，其余回退 low", () => {
    expect(normalizeRiskLevel("medium")).toBe("medium");
    expect(normalizeRiskLevel("high")).toBe("high");
    expect(normalizeRiskLevel("LOW")).toBe("low");
    expect(normalizeRiskLevel(undefined)).toBe("low");
  });
});

describe("buildGoalDetail", () => {
  it("组装基本信息：分类标签、剩余天数取整不为负、assessment 取自 metadata", () => {
    const detail = buildGoalDetail(
      {
        id: "g1",
        title: "备考软考",
        category: "exam",
        deadline: date("2026-09-14"), // 已过截止日
        dailyMinutes: 90,
        userContext: "零基础",
        status: "active",
        metadata: { assessment: "差距较大" },
        createdAt: date("2026-09-01"),
      },
      [makePhase()],
      makeTaskStats(),
      [],
      TODAY
    );
    expect(detail.categoryLabel).toBe("考试");
    expect(detail.daysLeft).toBe(0);
    expect(detail.deadlineLabel).toBe("2026-09-14");
    expect(detail.assessment).toBe("差距较大");
    expect(detail.totalTasks).toBe(5);
    expect(detail.doneTasks).toBe(3); // phaseId 为 null 的任务也计入总进度
    expect(detail.overallPercent).toBe(60);
    expect(detail.reports).toEqual([]);
  });

  it("未知分类原样展示，assessment 缺失为空串", () => {
    const detail = buildGoalDetail(
      {
        id: "g2",
        title: "x",
        category: "mystery",
        deadline: date("2026-09-20"),
        dailyMinutes: 30,
        userContext: "ctx",
        status: "archived",
        metadata: null,
        createdAt: date("2026-09-01"),
      },
      [],
      [],
      [],
      TODAY
    );
    expect(detail.categoryLabel).toBe("mystery");
    expect(detail.assessment).toBe("");
    expect(detail.status).toBe("archived");
  });
});
