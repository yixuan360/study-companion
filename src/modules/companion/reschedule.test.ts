import { describe, expect, it } from "vitest";
import {
  phaseWeeks,
  planReschedule,
  toReschedulePreview,
  type ReschedulePhaseInput,
  type RescheduleTaskInput,
} from "./reschedule";

function date(s: string): Date {
  return new Date(`${s}T00:00:00`);
}

/**
 * 固定布局：P1 09/01~09/28（4 周）→ P2 09/29~11/09（6 周）→ P3 11/10~12/07（4 周）
 * 阶段连续、含两端，与 computePhaseDates 约定一致。
 */
function makePhases(): ReschedulePhaseInput[] {
  return [
    { id: "p1", name: "基础期", order: 1, startDate: date("2026-09-01"), endDate: date("2026-09-28") },
    { id: "p2", name: "强化期", order: 2, startDate: date("2026-09-29"), endDate: date("2026-11-09") },
    { id: "p3", name: "冲刺期", order: 3, startDate: date("2026-11-10"), endDate: date("2026-12-07") },
  ];
}

function task(
  id: string,
  due: string,
  phaseId: string | null,
  title = id
): RescheduleTaskInput {
  return { id, title, dueDate: date(due), phaseId };
}

describe("phaseWeeks", () => {
  it("按含两端的天数 / 7 计算周数", () => {
    expect(phaseWeeks(date("2026-09-01"), date("2026-09-28"))).toBe(4);
    expect(phaseWeeks(date("2026-09-29"), date("2026-11-09"))).toBe(6);
  });
});

describe("planReschedule", () => {
  it("周数不变时：阶段日期原样、任务零变更", () => {
    const plan = planReschedule(
      makePhases(),
      [task("t1", "2026-09-15", "p1"), task("t2", "2026-11-20", "p3")],
      [4, 6, 4]
    );
    expect(plan.phases).toHaveLength(3);
    for (const p of plan.phases) {
      expect(p.newStart.getTime()).toBe(p.oldStart.getTime());
      expect(p.newEnd.getTime()).toBe(p.oldEnd.getTime());
    }
    expect(plan.tasks).toEqual([]);
  });

  it("延长中间阶段一周：后续阶段连锁平移 +7，任务保留日期并按新区间迁移", () => {
    const plan = planReschedule(
      makePhases(),
      [
        task("t1", "2026-09-15", "p1"), // 不动
        task("t2", "2026-11-10", "p3"), // 原 P3 首日，平移后落入 P2 → 迁移
        task("t3", "2026-11-17", "p3"), // 平移后仍在新 P3（11/17~12/14）→ 不动
      ],
      [4, 7, 4]
    );

    const [, p2, p3] = plan.phases;
    expect(toISO(p2.newStart)).toBe("2026-09-29");
    expect(toISO(p2.newEnd)).toBe("2026-11-16"); // 原 11/09 +7
    expect(toISO(p3.newStart)).toBe("2026-11-17"); // 连锁平移 +7
    expect(toISO(p3.newEnd)).toBe("2026-12-14");

    expect(plan.tasks).toHaveLength(1);
    const t2 = plan.tasks[0];
    expect(t2.id).toBe("t2");
    expect(toISO(t2.newDueDate)).toBe("2026-11-10"); // dueDate 不动
    expect(t2.oldPhaseId).toBe("p3");
    expect(t2.newPhaseId).toBe("p2"); // 跨阶段移动
    expect(t2.reason).toContain("归属到「强化期」");
  });

  it("缩短中间阶段：被删区间任务保留日期迁入后续阶段，越末任务收敛到末阶段末天", () => {
    const plan = planReschedule(
      makePhases(),
      [
        task("t1", "2026-10-25", "p2"), // 原 P2，缩短后落入新 P3（10/20~11/16）
        task("t2", "2026-12-01", "p3"), // 超出新末阶段末天 11/16 → 收敛
      ],
      [4, 3, 4]
    );

    const [, p2, p3] = plan.phases;
    expect(toISO(p2.newEnd)).toBe("2026-10-19");
    expect(toISO(p3.newStart)).toBe("2026-10-20");
    expect(toISO(p3.newEnd)).toBe("2026-11-16");

    const t1 = plan.tasks.find((t) => t.id === "t1")!;
    expect(toISO(t1.newDueDate)).toBe("2026-10-25"); // 日期保留
    expect(t1.newPhaseId).toBe("p3"); // 被删区间任务跟随日期迁入相邻阶段
    expect(t1.reason).toContain("归属到「冲刺期」");

    const t2 = plan.tasks.find((t) => t.id === "t2")!;
    expect(toISO(t2.newDueDate)).toBe("2026-11-16"); // 顺延到末阶段末天
    expect(t2.newPhaseId).toBe("p3"); // 仍属末阶段，无迁移
    expect(t2.reason).toContain("顺延到末阶段末天");
    expect(t2.reason).not.toContain("归属到");
  });

  it("边界日：正好落在阶段末天归属本阶段，次日归属下阶段", () => {
    // P2 延长到 11/16：11/16 是 P2 末天（含），11/17 是 P3 首日
    // 用「挂靠错误」的任务触发重算：dueDate 不变、归属被修正到边界所在阶段
    const plan = planReschedule(
      makePhases(),
      [task("end", "2026-11-16", "p3"), task("next", "2026-11-17", "p2")],
      [4, 7, 4]
    );
    const end = plan.tasks.find((t) => t.id === "end");
    const next = plan.tasks.find((t) => t.id === "next");
    expect(toISO(end!.newDueDate)).toBe("2026-11-16");
    expect(end!.newPhaseId).toBe("p2");
    expect(toISO(next!.newDueDate)).toBe("2026-11-17");
    expect(next!.newPhaseId).toBe("p3");
  });

  it("首阶段开始之前的任务收敛到首阶段首日", () => {
    const plan = planReschedule(
      makePhases(),
      [task("early", "2026-08-30", "p1")],
      [4, 6, 4]
    );
    expect(plan.tasks).toHaveLength(1);
    expect(toISO(plan.tasks[0].newDueDate)).toBe("2026-09-01");
    expect(plan.tasks[0].newPhaseId).toBe("p1");
    expect(plan.tasks[0].reason).toContain("提前到首阶段首日");
  });

  it("phaseId 为 null 的任务不迁移也不改期", () => {
    const plan = planReschedule(
      makePhases(),
      [task("free", "2026-12-01", null)],
      [4, 6, 4]
    );
    expect(plan.tasks).toEqual([]);
  });

  it("输入校验：周数数量不符 / 非整数 / 小于 1 / 无阶段 均抛错", () => {
    expect(() => planReschedule(makePhases(), [], [4, 6])).toThrow("不一致");
    expect(() => planReschedule(makePhases(), [], [4, 0, 4])).toThrow("不小于 1");
    expect(() => planReschedule(makePhases(), [], [4, 1.5, 4])).toThrow("不小于 1");
    expect(() => planReschedule(makePhases(), [], [4, -2, 4])).toThrow("不小于 1");
    expect(() => planReschedule([], [], [])).toThrow("没有阶段");
  });

  it("阶段乱序输入时按 order 排序后再与周数对应", () => {
    const reversed = [...makePhases()].reverse();
    const plan = planReschedule(reversed, [], [4, 7, 4]);
    expect(plan.phases.map((p) => p.order)).toEqual([1, 2, 3]);
    expect(toISO(plan.phases[1].newEnd)).toBe("2026-11-16");
  });
});

describe("toReschedulePreview", () => {
  it("输出可序列化预览与统计数", () => {
    // 缩短：P2 6→3、P3 4→3 → P2 09/29~10/19，P3 10/20~11/09
    const phases = makePhases();
    const plan = planReschedule(
      phases,
      [
        task("t1", "2026-10-25", "p2"), // 落入新 P3 区间 → 迁移，日期不变
        task("t2", "2026-11-25", "p3"), // 超出新末阶段末天 11/09 → 收敛改期
      ],
      [4, 3, 3]
    );
    const preview = toReschedulePreview(plan, phases);

    expect(preview.phaseChangeCount).toBe(2); // P2、P3 变了，P1 没变
    expect(preview.dueChangeCount).toBe(1); // t2 收敛改期
    expect(preview.migrateCount).toBe(1); // t1 换归属

    const p1 = preview.phases.find((p) => p.id === "p1")!;
    expect(p1.changed).toBe(false);
    const p2 = preview.phases.find((p) => p.id === "p2")!;
    expect(p2.changed).toBe(true);
    expect(p2.oldRange).toBe("09/29 ~ 11/09");
    expect(p2.newRange).toBe("09/29 ~ 10/19");
    expect(p2.newWeeks).toBe(3);

    const t1 = preview.taskChanges.find((t) => t.id === "t1")!;
    expect(t1.oldDueDate).toBe("2026-10-25");
    expect(t1.newDueDate).toBe("2026-10-25");
    expect(t1.oldPhaseName).toBe("强化期");
    expect(t1.newPhaseName).toBe("冲刺期");

    const t2 = preview.taskChanges.find((t) => t.id === "t2")!;
    expect(t2.oldDueDate).toBe("2026-11-25");
    expect(t2.newDueDate).toBe("2026-11-09");
  });
});

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
