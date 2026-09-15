import { prisma } from "@/lib/db";
import { addDays, startOfToday } from "@/modules/companion/plan";
import {
  daysUntil,
  getWeekTasks,
  startOfWeek,
  toISODate,
  weekdayLabel,
} from "@/modules/companion/stats";
import { normalizeRiskLevel } from "@/modules/companion/goal-detail";
import { BackLink } from "@/app/_components/BackLink";
import PlanClient, { type PlanData } from "./PlanClient";

export default async function CompanionPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ goalId?: string }>;
}) {
  const { goalId: goalIdParam } = await searchParams;
  const goals = await prisma.goal.findMany({
    where: { status: "active" },
    orderBy: { createdAt: "asc" },
  });

  if (goals.length === 0) {
    return (
      <main className="min-h-svh bg-zinc-50 px-4 py-6 dark:bg-black sm:px-6">
        <div className="mx-auto max-w-2xl">
          <div className="mb-6">
            <BackLink href="/companion">返回陪伴模块</BackLink>
          </div>
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center dark:border-zinc-700 dark:bg-zinc-900">
            <div className="mb-3 text-4xl">🗺️</div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              还没有目标，先创建一个吧
            </p>
          </div>
        </div>
      </main>
    );
  }

  const goal = goals.find((g) => g.id === goalIdParam) ?? goals[0];
  const today = startOfToday();
  const weekStart = startOfWeek(today);
  const nextWeekStart = addDays(weekStart, 7);

  const [weekTasks, report, nextWeekTaskCount] = await Promise.all([
    getWeekTasks(goal.id, weekStart),
    prisma.weeklyReport.findFirst({
      where: { goalId: goal.id, weekStart },
      orderBy: { createdAt: "desc" },
    }),
    prisma.task.count({
      where: { goalId: goal.id, dueDate: { gte: nextWeekStart, lt: addDays(nextWeekStart, 7) } },
    }),
  ]);

  const phases = await prisma.phase.findMany({
    where: { goalId: goal.id },
    orderBy: { order: "asc" },
  });

  const weekDays: PlanData["weekDays"] = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i);
    weekDays.push({
      label: weekdayLabel(date),
      dateLabel: toISODate(date).slice(5).replace("-", "/"),
      dateISO: toISODate(date),
      isToday: toISODate(date) === toISODate(today),
      tasks: weekTasks
        .filter((t) => toISODate(t.dueDate) === toISODate(date))
        .map((t) => ({
          id: t.id,
          title: t.title,
          estMinutes: t.estMinutes,
          status: t.status,
          resultNote: t.resultNote,
        })),
    });
  }

  const reportMeta = (report?.metadata ?? null) as {
    riskLevel?: string;
    nextWeekTasks?: { day: number; title: string; detail: string; minutes: number }[];
  } | null;

  const data: PlanData = {
    goals: goals.map((g) => ({ id: g.id, title: g.title })),
    currentGoalId: goal.id,
    goalTitle: goal.title,
    daysLeft: Math.max(0, daysUntil(goal.deadline, today)),
    deadlineLabel: toISODate(goal.deadline),
    dailyMinutes: goal.dailyMinutes,
    phases: phases.map((p) => ({
      order: p.order,
      name: p.name,
      startLabel: toISODate(p.startDate).slice(5).replace("-", "/"),
      endLabel: toISODate(p.endDate).slice(5).replace("-", "/"),
      focus: p.focus,
      exitCriteria:
        typeof p.metadata === "object" && p.metadata !== null && "exitCriteria" in p.metadata
          ? String((p.metadata as { exitCriteria: unknown }).exitCriteria)
          : "",
      isCurrent: p.startDate <= today && p.endDate >= today,
    })),
    weekDays,
    report: report
      ? {
          riskLevel: normalizeRiskLevel(reportMeta?.riskLevel),
          summary: report.aiSummary,
          adjustments: report.adjustments,
          completionRate: report.completionRate,
          nextWeekTasks: reportMeta?.nextWeekTasks ?? [],
        }
      : null,
    nextWeekConfirmed: nextWeekTaskCount > 0,
    nextWeekStartISO: toISODate(nextWeekStart),
  };

  return (
    <main className="min-h-svh bg-zinc-50 px-4 py-6 dark:bg-black sm:px-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6">
          <BackLink href="/companion">返回陪伴模块</BackLink>
        </div>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">周计划</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            阶段总览、本周任务日历与周报
          </p>
        </div>
        <PlanClient data={data} />
      </div>
    </main>
  );
}
