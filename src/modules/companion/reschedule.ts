/**
 * 执行中调整阶段结构（改各阶段周数）的变更计划计算（纯函数，可单测）。
 *
 * 规则：
 * - 以 order 最小阶段的现有 startDate 为锚点，各阶段按新周数连续排布
 *   （与 computePhaseDates 同一约定：endDate = start + weeks*7 - 1）；
 * - 任务原则上保留原 dueDate，按新阶段区间重新归属 phaseId（跨阶段迁移）；
 * - dueDate 超出调整后总区间时收敛到首阶段首日 / 末阶段末天（跟随所在区间），
 *   绝不丢任务、绝不置空 phaseId；
 * - phaseId 本就为 null 的任务不动（未挂阶段的手动任务保持原样）。
 */
import { addDays, startOfDay, toISODate } from "./plan";

const DAY_MS = 86_400_000;

export interface ReschedulePhaseInput {
  id: string;
  name: string;
  order: number;
  startDate: Date;
  endDate: Date;
}

export interface RescheduleTaskInput {
  id: string;
  title: string;
  dueDate: Date;
  phaseId: string | null;
}

export interface PhaseChange {
  id: string;
  name: string;
  order: number;
  oldStart: Date;
  oldEnd: Date;
  newStart: Date;
  newEnd: Date;
}

export interface TaskChange {
  id: string;
  title: string;
  oldDueDate: Date;
  newDueDate: Date;
  oldPhaseId: string | null;
  newPhaseId: string | null;
  reason: string;
}

export interface ReschedulePlan {
  /** 全部阶段（含未变化的），按 order 升序 */
  phases: PhaseChange[];
  /** 只有发生改期或迁移的任务 */
  tasks: TaskChange[];
}

/** 阶段实际周数（start~end 含两端，按 computePhaseDates 约定应整除 7）。 */
export function phaseWeeks(startDate: Date, endDate: Date): number {
  return Math.round((endDate.getTime() - startDate.getTime()) / DAY_MS + 1) / 7;
}

/**
 * 计算调整周数后的完整变更计划。
 * @param phases 目标的全阶段（内部按 order 升序排序）
 * @param tasks 目标的全任务
 * @param newWeeks 新周数数组，与按 order 升序后的阶段一一对应，均为 ≥1 整数
 */
export function planReschedule(
  phases: ReschedulePhaseInput[],
  tasks: RescheduleTaskInput[],
  newWeeks: number[]
): ReschedulePlan {
  if (phases.length === 0) {
    throw new Error("目标没有阶段");
  }
  if (newWeeks.length !== phases.length) {
    throw new Error("周数数量与阶段数量不一致");
  }
  for (const weeks of newWeeks) {
    if (!Number.isInteger(weeks) || weeks < 1) {
      throw new Error("每周数应为不小于 1 的整数");
    }
  }

  // 1. 重排阶段：锚定首阶段现有开始日，按新周数连续排布
  const sorted = [...phases].sort((a, b) => a.order - b.order);
  let cursor = startOfDay(sorted[0].startDate);
  const phaseChanges: PhaseChange[] = sorted.map((phase, i) => {
    const newStart = cursor;
    const newEnd = addDays(newStart, newWeeks[i] * 7 - 1);
    cursor = addDays(newEnd, 1);
    return {
      id: phase.id,
      name: phase.name,
      order: phase.order,
      oldStart: phase.startDate,
      oldEnd: phase.endDate,
      newStart,
      newEnd,
    };
  });

  const first = phaseChanges[0];
  const last = phaseChanges[phaseChanges.length - 1];
  const phaseAt = (d: Date) =>
    phaseChanges.find((p) => p.newStart <= d && d <= p.newEnd) ?? null;
  const nameOf = (id: string | null) =>
    phaseChanges.find((p) => p.id === id)?.name ?? "未分配";

  // 2. 任务迁移：保留 dueDate，按新区间重挂 phaseId；越界收敛到首/末阶段
  const taskChanges: TaskChange[] = [];
  for (const task of tasks) {
    if (task.phaseId === null) continue;

    const reasons: string[] = [];
    let newDue = startOfDay(task.dueDate);
    if (newDue < first.newStart) {
      newDue = first.newStart;
      reasons.push("超出调整后总区间，提前到首阶段首日");
    } else if (newDue > last.newEnd) {
      newDue = last.newEnd;
      reasons.push("超出调整后总区间，顺延到末阶段末天");
    }

    const container = phaseAt(newDue);
    if (!container) continue; // 理论不可达（已收敛），防御
    if (container.id !== task.phaseId) {
      reasons.push(`「${nameOf(task.phaseId)}」区间变动，归属到「${container.name}」`);
    }

    if (reasons.length === 0) continue;
    taskChanges.push({
      id: task.id,
      title: task.title,
      oldDueDate: task.dueDate,
      newDueDate: newDue,
      oldPhaseId: task.phaseId,
      newPhaseId: container.id,
      reason: reasons.join("；"),
    });
  }

  return { phases: phaseChanges, tasks: taskChanges };
}

/** 确认清单用的可序列化预览（日期全部转字符串，供跨组件边界传递）。 */
export interface ReschedulePhasePreview {
  id: string;
  name: string;
  order: number;
  changed: boolean;
  oldRange: string;
  newRange: string;
  newWeeks: number;
}

export interface RescheduleTaskPreview {
  id: string;
  title: string;
  oldDueDate: string;
  newDueDate: string;
  oldPhaseName: string;
  newPhaseName: string;
  reason: string;
}

export interface ReschedulePreview {
  phases: ReschedulePhasePreview[];
  taskChanges: RescheduleTaskPreview[];
  phaseChangeCount: number;
  dueChangeCount: number;
  migrateCount: number;
}

function mmdd(date: Date): string {
  return toISODate(date).slice(5).replace("-", "/");
}

export function toReschedulePreview(
  plan: ReschedulePlan,
  phases: ReschedulePhaseInput[]
): ReschedulePreview {
  const nameById = new Map(phases.map((p) => [p.id, p.name]));
  const sameDay = (a: Date, b: Date) => a.getTime() === b.getTime();

  const taskChanges = plan.tasks.map((t) => ({
    id: t.id,
    title: t.title,
    oldDueDate: toISODate(t.oldDueDate),
    newDueDate: toISODate(t.newDueDate),
    oldPhaseName: t.oldPhaseId ? (nameById.get(t.oldPhaseId) ?? "未分配") : "未分配",
    newPhaseName: t.newPhaseId ? (nameById.get(t.newPhaseId) ?? "未分配") : "未分配",
    reason: t.reason,
  }));

  return {
    phases: plan.phases.map((p) => ({
      id: p.id,
      name: p.name,
      order: p.order,
      changed: !sameDay(p.oldStart, p.newStart) || !sameDay(p.oldEnd, p.newEnd),
      oldRange: `${mmdd(p.oldStart)} ~ ${mmdd(p.oldEnd)}`,
      newRange: `${mmdd(p.newStart)} ~ ${mmdd(p.newEnd)}`,
      newWeeks: Math.round(
        (p.newEnd.getTime() - p.newStart.getTime()) / DAY_MS + 1
      ) / 7,
    })),
    taskChanges,
    phaseChangeCount: plan.phases.filter(
      (p) => !sameDay(p.oldStart, p.newStart) || !sameDay(p.oldEnd, p.newEnd)
    ).length,
    dueChangeCount: plan.tasks.filter((t) => !sameDay(t.oldDueDate, t.newDueDate)).length,
    migrateCount: plan.tasks.filter((t) => t.oldPhaseId !== t.newPhaseId).length,
  };
}
