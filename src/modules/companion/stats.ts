import { prisma } from "@/lib/db";
import { addDays, startOfDay, startOfToday } from "./plan";

export type TaskStatusValue = "pending" | "done" | "skipped";

/** 本地自然日的 YYYY-MM-DD，用于去重与展示。 */
export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 以周一为一周开始的本周零点。 */
export function startOfWeek(date = new Date()): Date {
  const d = startOfDay(date);
  const mondayOffset = (d.getDay() + 6) % 7;
  return addDays(d, -mondayOffset);
}

export function daysUntil(deadline: Date, today = startOfToday()): number {
  return Math.ceil(
    (startOfDay(deadline).getTime() - today.getTime()) / 86_400_000
  );
}

const weekdayLabels = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

export function weekdayLabel(date: Date): string {
  return weekdayLabels[(date.getDay() + 6) % 7];
}

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
