import { prisma } from "@/lib/db";
import { addDays, startOfToday, toISODate } from "./plan";

// 纯日期工具已移至 plan.ts，这里重导出以保持既有 import 路径不变
export { daysUntil, startOfWeek, toISODate, weekdayLabel } from "./plan";

export type TaskStatusValue = "pending" | "done" | "skipped";

/** 查询某目标 [weekStart, weekStart+7) 的任务，按到期日排序。 */
export function getWeekTasks(goalId: string, weekStart: Date) {
  return prisma.task.findMany({
    where: { goalId, dueDate: { gte: weekStart, lt: addDays(weekStart, 7) } },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
  });
}

/** 连续打卡天数：从今天（若今天未打卡则从昨天）往前，每天至少完成 1 个任务。 */
export async function getCheckInStreak(
  goalId: string,
  today = startOfToday()
): Promise<number> {
  const since = addDays(today, -59);
  const doneTasks = await prisma.task.findMany({
    where: {
      goalId,
      status: "done",
      doneAt: { gte: since, lt: addDays(today, 1) },
    },
    select: { doneAt: true },
  });

  const doneDays = new Set(
    doneTasks.map((t) => toISODate(t.doneAt as Date))
  );
  if (doneDays.size === 0) return 0;

  let cursor = doneDays.has(toISODate(today)) ? today : addDays(today, -1);
  let streak = 0;
  while (doneDays.has(toISODate(cursor))) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}
