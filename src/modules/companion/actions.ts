"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

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
