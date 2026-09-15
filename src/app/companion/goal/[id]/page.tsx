import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { BackLink } from "@/app/_components/BackLink";
import { startOfToday, toISODate } from "@/modules/companion/plan";
import {
  buildGoalDetail,
  RISK_LEVEL_STYLES,
} from "@/modules/companion/goal-detail";
import { phaseWeeks } from "@/modules/companion/reschedule";
import { GoalActions } from "../../GoalActions";
import { ReschedulePanel } from "./ReschedulePanel";

export default async function GoalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const goal = await prisma.goal.findUnique({ where: { id } });
  if (!goal) notFound();

  const [phases, taskStats, reports] = await Promise.all([
    prisma.phase.findMany({ where: { goalId: id }, orderBy: { order: "asc" } }),
    prisma.task.findMany({ where: { goalId: id }, select: { phaseId: true, status: true } }),
    prisma.weeklyReport.findMany({
      where: { goalId: id },
      orderBy: [{ weekStart: "desc" }, { createdAt: "desc" }],
    }),
  ]);

  const detail = buildGoalDetail(goal, phases, taskStats, reports, startOfToday());

  return (
    <main className="min-h-svh bg-zinc-50 px-4 py-6 dark:bg-black sm:px-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6">
          <BackLink href="/companion">返回陪伴模块</BackLink>
        </div>

        <div className="mb-6 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
              {detail.title}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-medium text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">
                {detail.categoryLabel}
              </span>
              {detail.status !== "active" && (
                <span className="rounded-full bg-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                  已归档
                </span>
              )}
            </div>
          </div>
          <div className="shrink-0">
            <GoalActions
              goalId={detail.id}
              archived={detail.status !== "active"}
              afterActionHref="/companion"
            />
          </div>
        </div>

        <div className="space-y-8">
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <dl className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="shrink-0 text-zinc-500 dark:text-zinc-400">截止日期</dt>
                <dd className="text-right font-medium text-zinc-900 dark:text-zinc-50">
                  {detail.deadlineLabel}
                  <span className="ml-2 text-xs font-normal text-zinc-500 dark:text-zinc-400">
                    {detail.daysLeft > 0 ? `剩 ${detail.daysLeft} 天` : "已过截止"}
                  </span>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="shrink-0 text-zinc-500 dark:text-zinc-400">每日可投入</dt>
                <dd className="font-medium text-zinc-900 dark:text-zinc-50">
                  {detail.dailyMinutes} 分钟
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="shrink-0 text-zinc-500 dark:text-zinc-400">创建于</dt>
                <dd className="font-medium text-zinc-900 dark:text-zinc-50">
                  {detail.createdAtLabel}
                </dd>
              </div>
            </dl>

            <div className="mt-4 border-t border-zinc-100 pt-4 dark:border-zinc-800">
              <div className="mb-1 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                <span>累计进度</span>
                <span>
                  {detail.doneTasks}/{detail.totalTasks} · {detail.overallPercent}%
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${detail.overallPercent}%` }}
                />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="mb-2 text-base font-semibold text-zinc-900 dark:text-zinc-50">
              现状自述
            </h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
              {detail.userContext}
            </p>
            {detail.assessment && (
              <div className="mt-3 rounded-xl bg-indigo-50/70 p-3 dark:bg-indigo-900/15">
                <p className="mb-1 text-xs font-medium text-indigo-600 dark:text-indigo-300">
                  AI 差距评估（建目标时生成）
                </p>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-indigo-900 dark:text-indigo-100">
                  {detail.assessment}
                </p>
              </div>
            )}
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                阶段时间线
              </h2>
              <div className="flex shrink-0 items-center">
                <Link
                  href={`/companion/plan?goalId=${detail.id}`}
                  className="inline-flex min-h-[44px] items-center gap-1 rounded-lg px-3 text-sm font-medium text-indigo-600 transition hover:bg-indigo-50 active:scale-[0.98] dark:text-indigo-400 dark:hover:bg-indigo-900/20"
                >
                  本周计划与打卡<span aria-hidden>→</span>
                </Link>
                {detail.status === "active" && phases.length > 0 && (
                  <ReschedulePanel
                    goalId={detail.id}
                    phases={phases.map((p) => ({
                      id: p.id,
                      name: p.name,
                      order: p.order,
                      weeks: phaseWeeks(p.startDate, p.endDate),
                      rangeLabel: `${toISODate(p.startDate).slice(5).replace("-", "/")} ~ ${toISODate(p.endDate).slice(5).replace("-", "/")}`,
                    }))}
                  />
                )}
              </div>
            </div>

            {detail.phases.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-6 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
                暂无阶段
              </div>
            ) : (
              <ol>
                {detail.phases.map((phase, index) => (
                  <li key={phase.id} className="relative pb-6 pl-8 last:pb-0">
                    {index < detail.phases.length - 1 && (
                      <span
                        aria-hidden
                        className="absolute bottom-0 left-[7px] top-5 w-0.5 -translate-x-1/2 bg-zinc-200 dark:bg-zinc-800"
                      />
                    )}
                    <span
                      aria-hidden
                      className={`absolute left-0 top-1.5 h-3.5 w-3.5 rounded-full ${
                        phase.isCurrent
                          ? "bg-indigo-600 ring-4 ring-indigo-100 dark:ring-indigo-900/40"
                          : phase.timing === "past"
                            ? "bg-emerald-500"
                            : "bg-zinc-300 dark:bg-zinc-600"
                      }`}
                    />
                    <div
                      className={`rounded-2xl border p-4 ${
                        phase.isCurrent
                          ? "border-indigo-300 bg-indigo-50/60 dark:border-indigo-900/50 dark:bg-indigo-900/10"
                          : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                      }`}
                    >
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                          {phase.order}
                        </span>
                        <p className="font-medium text-zinc-900 dark:text-zinc-50">
                          {phase.name}
                        </p>
                        {phase.isCurrent && (
                          <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                            当前阶段
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-400 dark:text-zinc-500">
                        {phase.startLabel} ~ {phase.endLabel}
                      </p>
                      <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
                        {phase.focus}
                      </p>
                      {phase.exitCriteria && (
                        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                          结束标志：{phase.exitCriteria}
                        </p>
                      )}
                      {phase.total === 0 ? (
                        <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
                          暂无任务
                        </p>
                      ) : (
                        <div className="mt-2">
                          <div className="mb-1 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                            <span>完成度</span>
                            <span>
                              {phase.done}/{phase.total} · {phase.percent}%
                            </span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                            <div
                              className="h-full rounded-full bg-emerald-500 transition-all"
                              style={{ width: `${phase.percent}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              历史周报
            </h2>
            {detail.reports.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-6 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
                还没有周报，去本周计划页生成第一份
              </div>
            ) : (
              <div className="space-y-3">
                {detail.reports.map((report) => {
                  const risk = RISK_LEVEL_STYLES[report.riskLevel];
                  return (
                    <div
                      key={report.id}
                      className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
                    >
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className={`h-3 w-3 rounded-full ${risk.dot}`} />
                        <span className={`text-sm font-semibold ${risk.text}`}>
                          {risk.label}
                        </span>
                        <span className="text-xs text-zinc-400 dark:text-zinc-500">
                          {report.weekLabel}
                        </span>
                        <span className="ml-auto text-xs text-zinc-400 dark:text-zinc-500">
                          完成率 {report.completionRate}%
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                        {report.summary}
                      </p>
                      {report.adjustments && (
                        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                          调整建议：{report.adjustments}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
