"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import {
  planReschedule,
  toReschedulePreview,
  type ReschedulePreview,
} from "./reschedule";

/** 删除目标：级联删除阶段、任务、周报（schema 已配 onDelete: Cascade），不可恢复 */
export async function deleteGoalAction(goalId: string): Promise<void> {
  await prisma.goal.delete({ where: { id: goalId } });
  revalidatePath("/companion");
}

/** 归档目标：不删数据，从进行中列表隐藏 */
export async function archiveGoalAction(goalId: string): Promise<void> {
  await prisma.goal.update({ where: { id: goalId }, data: { status: "archived" } });
  revalidatePath("/companion");
}

/** 恢复目标：从归档回到进行中列表 */
export async function restoreGoalAction(goalId: string): Promise<void> {
  await prisma.goal.update({ where: { id: goalId }, data: { status: "active" } });
  revalidatePath("/companion");
}

async function loadRescheduleInputs(goalId: string) {
  const [phases, tasks] = await Promise.all([
    prisma.phase.findMany({ where: { goalId }, orderBy: { order: "asc" } }),
    prisma.task.findMany({
      where: { goalId },
      select: { id: true, title: true, dueDate: true, phaseId: true },
    }),
  ]);
  return { phases, tasks };
}

/** 阶段结构调整预览：计算完整变更计划（阶段新日期 + 任务改期/迁移），不落库 */
export async function previewRescheduleAction(
  goalId: string,
  newWeeks: number[]
): Promise<ReschedulePreview> {
  const { phases, tasks } = await loadRescheduleInputs(goalId);
  return toReschedulePreview(planReschedule(phases, tasks, newWeeks), phases);
}

/**
 * 阶段结构调整落库：transaction 内更新阶段日期与任务 dueDate/phaseId。
 * 变更计划在落库时重新计算（与预览同一纯函数，单用户下结果一致）。
 */
export async function applyRescheduleAction(
  goalId: string,
  newWeeks: number[]
): Promise<void> {
  const { phases, tasks } = await loadRescheduleInputs(goalId);
  const plan = planReschedule(phases, tasks, newWeeks);

  await prisma.$transaction(async (tx) => {
    for (const phase of plan.phases) {
      await tx.phase.update({
        where: { id: phase.id },
        data: { startDate: phase.newStart, endDate: phase.newEnd },
      });
    }
    for (const task of plan.tasks) {
      await tx.task.update({
        where: { id: task.id },
        data: { dueDate: task.newDueDate, phaseId: task.newPhaseId },
      });
    }
  });

  revalidatePath(`/companion/goal/${goalId}`);
  revalidatePath("/companion/plan");
  revalidatePath("/companion/today");
}
