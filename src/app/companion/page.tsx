import Link from "next/link";
import { prisma } from "@/lib/db";
import { BackLink } from "@/app/_components/BackLink";
import { addDays, startOfToday } from "@/modules/companion/plan";
import { daysUntil, startOfWeek, weekdayLabel } from "@/modules/companion/stats";
import { GoalActions } from "./GoalActions";

const categoryLabels: Record<string, string> = {
  exam: "考试",
  project: "项目",
  habit: "习惯",
};

export default async function CompanionPage() {
  const today = startOfToday();
  const weekStart = startOfWeek(today);
  const weekEnd = addDays(weekStart, 7); // 不含
  const tomorrow = addDays(today, 1); // 不含

  const goals = await prisma.goal.findMany({
    where: { status: "active" },
    orderBy: { createdAt: "asc" },
  });

  const weekTasks = await prisma.task.findMany({
    where: {
      goalId: { in: goals.map((g) => g.id) },
      dueDate: { gte: weekStart, lt: weekEnd },
    },
    select: { goalId: true, status: true, dueDate: true },
  });

  const statsByGoal = new Map<
    string,
    { weekTotal: number; weekDone: number; todayTotal: number; todayDone: number }
  >();
  let todayTotalAll = 0;
  let todayDoneAll = 0;
  for (const task of weekTasks) {
    const stats = statsByGoal.get(task.goalId) ?? {
      weekTotal: 0,
      weekDone: 0,
      todayTotal: 0,
      todayDone: 0,
    };
    stats.weekTotal += 1;
    if (task.status === "done") stats.weekDone += 1;
    if (task.dueDate >= today && task.dueDate < tomorrow) {
      stats.todayTotal += 1;
      if (task.status === "done") stats.todayDone += 1;
      todayTotalAll += 1;
      if (task.status === "done") todayDoneAll += 1;
    }
    statsByGoal.set(task.goalId, stats);
  }

  const quickLinks = [
    {
      href: "/companion/today",
      title: "今日任务",
      description:
        todayTotalAll > 0
          ? todayDoneAll === todayTotalAll
            ? "今日任务已全部完成 🎉"
            : `共 ${todayTotalAll} 项，已完成 ${todayDoneAll}`
          : "今日暂无任务",
      emoji: "✅",
      colorClass: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300",
    },
    {
      href: "/companion/plan",
      title: "周计划与周报",
      description: "阶段总览、本周日历、进度风险",
      emoji: "🗓️",
      colorClass: "bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-300",
    },
  ];

  return (
    <main className="min-h-svh bg-zinc-50 px-4 py-6 dark:bg-black sm:px-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6">
          <BackLink href="/">返回首页</BackLink>
        </div>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">备考任务陪伴</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            定一个目标，AI 帮你拆成阶段和每日任务
          </p>
        </div>

        {goals.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center dark:border-zinc-700 dark:bg-zinc-900">
            <div className="mb-3 text-5xl">🎯</div>
            <h2 className="mb-2 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              还没有进行中的目标
            </h2>
            <p className="mb-6 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
              告诉我们你的目标、截止日期和现状，
              <br />
              AI 会生成阶段计划与第一周每日任务，
              <br />
              确认后每天只需按清单执行。
            </p>
            <Link
              href="/companion/new"
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-indigo-600 px-6 text-base font-medium text-white transition hover:bg-indigo-700"
            >
              开始一个新目标
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {quickLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-indigo-300 hover:shadow-md active:scale-[0.98] dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-indigo-900/50"
                >
                  <div
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg ${link.colorClass}`}
                  >
                    {link.emoji}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-zinc-900 dark:text-zinc-50">{link.title}</p>
                    <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                      {link.description}
                    </p>
                  </div>
                </Link>
              ))}
            </div>

            {goals.map((goal) => {
              const stats = statsByGoal.get(goal.id) ?? {
                weekTotal: 0,
                weekDone: 0,
                todayTotal: 0,
                todayDone: 0,
              };
              const percent =
                stats.weekTotal === 0
                  ? 0
                  : Math.round((stats.weekDone / stats.weekTotal) * 100);
              const remainDays = daysUntil(goal.deadline, today);
              return (
                <div
                  key={goal.id}
                  className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="mb-1 flex items-start justify-between gap-3">
                    <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                      {goal.title}
                    </h2>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-medium text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">
                        {categoryLabels[goal.category] ?? goal.category}
                      </span>
                      <GoalActions goalId={goal.id} />
                    </div>
                  </div>
                  <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
                    {remainDays > 0 ? (
                      <>
                        距截止还有{" "}
                        <span className="font-semibold text-zinc-900 dark:text-zinc-50">
                          {remainDays}
                        </span>{" "}
                        天
                      </>
                    ) : (
                      <span className="font-medium text-red-600 dark:text-red-400">
                        今天就是截止日
                      </span>
                    )}
                    {stats.weekTotal > 0 && (
                      <>
                        {" "}
                        · 本周（{weekdayLabel(weekStart)}起）进度 {stats.weekDone}/
                        {stats.weekTotal}
                      </>
                    )}
                  </p>

                  <div className="mb-1 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                    <span>本周进度</span>
                    <span>
                      {stats.weekDone}/{stats.weekTotal} · {percent}%
                    </span>
                  </div>
                  <div className="mb-4 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all"
                      style={{ width: `${percent}%` }}
                    />
                  </div>

                  <p className="text-sm text-zinc-600 dark:text-zinc-300">
                    {stats.todayTotal > 0 ? (
                      stats.todayDone === stats.todayTotal ? (
                        <span className="font-medium text-emerald-600 dark:text-emerald-400">
                          今日任务已全部完成 🎉
                        </span>
                      ) : (
                        <>
                          今日 <span className="font-semibold text-zinc-900 dark:text-zinc-50">{stats.todayTotal}</span>{" "}
                          项任务
                          {stats.todayDone > 0 && <>，已完成 {stats.todayDone}</>}
                        </>
                      )
                    ) : (
                      "今日暂无任务"
                    )}
                  </p>
                </div>
              );
            })}

            <Link
              href="/companion/new"
              className="flex min-h-[44px] items-center justify-center rounded-xl border border-zinc-200 bg-white px-5 py-3 text-base font-medium text-zinc-700 transition hover:border-indigo-300 hover:text-indigo-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-indigo-900/50"
            >
              + 再定一个新目标
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
