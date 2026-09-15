"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { RISK_LEVEL_STYLES } from "@/modules/companion/goal-detail";

export interface PlanData {
  goals: { id: string; title: string }[];
  currentGoalId: string;
  goalTitle: string;
  daysLeft: number;
  deadlineLabel: string;
  dailyMinutes: number;
  phases: {
    order: number;
    name: string;
    startLabel: string;
    endLabel: string;
    focus: string;
    exitCriteria: string;
    isCurrent: boolean;
  }[];
  weekDays: {
    label: string;
    dateLabel: string;
    dateISO: string;
    isToday: boolean;
    tasks: {
      id: string;
      title: string;
      estMinutes: number;
      status: "pending" | "done" | "skipped";
      resultNote: string | null;
    }[];
  }[];
  report: {
    riskLevel: "low" | "medium" | "high";
    summary: string;
    adjustments: string;
    completionRate: number;
    nextWeekTasks: { day: number; title: string; detail: string; minutes: number }[];
  } | null;
  nextWeekConfirmed: boolean;
  nextWeekStartISO: string;
}

const dayNames = ["下周一", "下周二", "下周三", "下周四", "下周五", "下周六", "下周日"];

type WeekTask = { day: number; title: string; detail: string; minutes: number };

function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

export default function PlanClient({ data }: { data: PlanData }) {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [nextWeekOverride, setNextWeekOverride] = useState<WeekTask[] | null>(null);
  const [weekInstruction, setWeekInstruction] = useState("");
  const [revisingWeek, setRevisingWeek] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addTitle, setAddTitle] = useState("");
  const [addDetail, setAddDetail] = useState("");
  const [addMinutes, setAddMinutes] = useState("30");
  const [addDate, setAddDate] = useState("");
  const [adding, setAdding] = useState(false);

  const nextWeekTasks: WeekTask[] =
    nextWeekOverride ?? data.report?.nextWeekTasks ?? [];
  const todayISO = data.weekDays.find((d) => d.isToday)?.dateISO ?? "";

  async function generateReport() {
    setError("");
    setGenerating(true);
    try {
      const res = await fetch(
        `/api/companion/weekly-review?goalId=${data.currentGoalId}`,
        { method: "POST" }
      );
      const result = (await res.json()) as { code: number; msg: string };
      if (result.code !== 0) {
        throw new Error(result.msg || "生成周报失败");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setGenerating(false);
    }
  }

  async function confirmNextWeek() {
    if (nextWeekTasks.length === 0) return;
    setError("");
    setConfirming(true);
    try {
      const res = await fetch("/api/companion/tasks/batch-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goalId: data.currentGoalId,
          weekStart: data.nextWeekStartISO,
          tasks: nextWeekTasks,
        }),
      });
      const result = (await res.json()) as { code: number; msg: string };
      if (result.code !== 0) {
        throw new Error(result.msg || "入库失败");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setConfirming(false);
    }
  }

  async function reviseNextWeek() {
    if (nextWeekTasks.length === 0 || !weekInstruction.trim()) return;
    setError("");
    setRevisingWeek(true);
    try {
      const res = await fetch("/api/companion/revise-week-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tasks: nextWeekTasks,
          instruction: weekInstruction.trim(),
          dailyMinutes: data.dailyMinutes,
        }),
      });
      const result = (await res.json()) as {
        code: number;
        data: { tasks: WeekTask[] } | null;
        msg: string;
      };
      if (result.code !== 0 || !result.data) {
        throw new Error(result.msg || "调整失败");
      }
      setNextWeekOverride(result.data.tasks);
      setWeekInstruction("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRevisingWeek(false);
    }
  }

  async function addTask() {
    setError("");
    setAdding(true);
    try {
      const res = await fetch("/api/companion/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goalId: data.currentGoalId,
          title: addTitle.trim(),
          detail: addDetail.trim(),
          estMinutes: Number(addMinutes),
          dueDate: addDate,
        }),
      });
      const result = (await res.json()) as { code: number; msg: string };
      if (result.code !== 0) {
        throw new Error(result.msg || "添加失败");
      }
      setAddOpen(false);
      setAddTitle("");
      setAddDetail("");
      setAddMinutes("30");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAdding(false);
    }
  }

  const weekTotal = data.weekDays.reduce((sum, d) => sum + d.tasks.length, 0);
  const weekDone = data.weekDays.reduce(
    (sum, d) => sum + d.tasks.filter((t) => t.status === "done").length,
    0
  );

  return (
    <div className="space-y-8">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}

      {data.goals.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {data.goals.map((g) => (
            <Link
              key={g.id}
              href={`/companion/plan?goalId=${g.id}`}
              className={`min-h-[36px] rounded-full px-4 py-1.5 text-sm font-medium transition ${
                g.id === data.currentGoalId
                  ? "bg-indigo-600 text-white"
                  : "border border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"
              }`}
            >
              {g.title}
            </Link>
          ))}
        </div>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {data.goalTitle}
          </h2>
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            剩 {data.daysLeft} 天 · 截止 {data.deadlineLabel}
          </span>
        </div>

        <div className="space-y-3">
          {data.phases.map((phase) => (
            <div
              key={phase.order}
              className={`rounded-2xl border p-4 ${
                phase.isCurrent
                  ? "border-indigo-300 bg-indigo-50/60 dark:border-indigo-900/50 dark:bg-indigo-900/10"
                  : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
              }`}
            >
              <div className="mb-1 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                  {phase.order}
                </span>
                <p className="font-medium text-zinc-900 dark:text-zinc-50">{phase.name}</p>
                {phase.isCurrent && (
                  <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                    当前阶段
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400 dark:text-zinc-500">
                {phase.startLabel} ~ {phase.endLabel}
              </p>
              <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">{phase.focus}</p>
              {phase.exitCriteria && (
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  结束标志：{phase.exitCriteria}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">本周任务</h2>
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            {weekDone}/{weekTotal} 已完成
          </span>
        </div>

        {weekTotal === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-6 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
            本周暂无任务
          </div>
        ) : (
          <div className="space-y-3">
            {data.weekDays.map((day) => (
              <div
                key={day.dateLabel}
                className={`rounded-2xl border p-4 ${
                  day.isToday
                    ? "border-indigo-300 bg-white dark:border-indigo-900/50 dark:bg-zinc-900"
                    : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                }`}
              >
                <div className="mb-2 flex items-center gap-2">
                  <p
                    className={`text-sm font-semibold ${
                      day.isToday
                        ? "text-indigo-600 dark:text-indigo-400"
                        : "text-zinc-700 dark:text-zinc-300"
                    }`}
                  >
                    {day.label} {day.dateLabel}
                  </p>
                  {day.isToday && (
                    <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                      今天
                    </span>
                  )}
                  {day.tasks.length === 0 && (
                    <span className="text-xs text-zinc-400 dark:text-zinc-500">无任务</span>
                  )}
                </div>
                {day.tasks.length > 0 && (
                  <ul className="space-y-1.5">
                    {day.tasks.map((task) => (
                      <li
                        key={task.id}
                        className="flex items-start justify-between gap-2 text-sm"
                      >
                        <span className="flex min-w-0 items-start gap-2">
                          <span
                            className={`mt-0.5 font-bold ${
                              task.status === "done"
                                ? "text-emerald-500"
                                : task.status === "skipped"
                                  ? "text-zinc-400"
                                  : "text-zinc-300 dark:text-zinc-600"
                            }`}
                          >
                            {task.status === "done" ? "✓" : task.status === "skipped" ? "↷" : "○"}
                          </span>
                          <span
                            className={
                              task.status === "done"
                                ? "text-zinc-500 line-through dark:text-zinc-500"
                                : task.status === "skipped"
                                  ? "text-zinc-400 dark:text-zinc-500"
                                  : "text-zinc-800 dark:text-zinc-200"
                            }
                          >
                            <Link
                              href={`/companion/plan/tasks/${task.id}`}
                              className="underline-offset-2 hover:underline"
                            >
                              {task.title}
                            </Link>
                            {task.resultNote && (
                              <span className="ml-1 text-xs text-zinc-400">
                                （{task.resultNote}）
                              </span>
                            )}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs text-zinc-400 dark:text-zinc-500">
                          {task.estMinutes}分钟
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}

            {addOpen ? (
              <div className="rounded-2xl border border-indigo-200 bg-white p-4 dark:border-indigo-900/50 dark:bg-zinc-900">
                <div className="space-y-2">
                  <input
                    type="text"
                    value={addTitle}
                    onChange={(e) => setAddTitle(e.target.value)}
                    placeholder="任务标题"
                    className="w-full rounded-lg border border-zinc-200 bg-white p-2.5 text-base text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
                  />
                  <textarea
                    value={addDetail}
                    onChange={(e) => setAddDetail(e.target.value)}
                    rows={2}
                    placeholder="怎么做、做到什么程度"
                    className="w-full rounded-lg border border-zinc-200 bg-white p-2.5 text-base text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      min={5}
                      max={1440}
                      value={addMinutes}
                      onChange={(e) => setAddMinutes(e.target.value)}
                      aria-label="预计分钟"
                      className="w-full rounded-lg border border-zinc-200 bg-white p-2.5 text-base text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
                    />
                    <input
                      type="date"
                      value={addDate}
                      onChange={(e) => setAddDate(e.target.value)}
                      aria-label="到期日"
                      className="w-full rounded-lg border border-zinc-200 bg-white p-2.5 text-base text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
                    />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={addTask}
                      disabled={adding || !addTitle.trim() || !addDetail.trim() || !addDate}
                      className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {adding && <Spinner />}
                      {adding ? "添加中..." : "保存任务"}
                    </button>
                    <button
                      onClick={() => setAddOpen(false)}
                      disabled={adding}
                      className="min-h-[44px] rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
                    >
                      取消
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <button
                onClick={() => {
                  setAddDate(todayISO);
                  setAddOpen(true);
                }}
                className="flex min-h-[44px] w-full items-center justify-center rounded-xl border border-dashed border-zinc-300 text-sm font-medium text-zinc-500 transition hover:border-indigo-400 hover:text-indigo-600 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-indigo-700 dark:hover:text-indigo-400"
              >
                + 手动添加任务
              </button>
            )}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          本周周报
        </h2>

        {data.report ? (
          <div className="space-y-3">
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="mb-2 flex items-center gap-2">
                <span
                  className={`h-3 w-3 rounded-full ${RISK_LEVEL_STYLES[data.report.riskLevel].dot}`}
                />
                <span
                  className={`text-sm font-semibold ${RISK_LEVEL_STYLES[data.report.riskLevel].text}`}
                >
                  {RISK_LEVEL_STYLES[data.report.riskLevel].label}
                </span>
                <span className="ml-auto text-xs text-zinc-400 dark:text-zinc-500">
                  完成率 {Math.round(data.report.completionRate)}%
                </span>
              </div>
              <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                {data.report.summary}
              </p>
            </div>

            {data.report.adjustments && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-900/20">
                <p className="mb-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                  调整建议
                </p>
                <p className="text-sm leading-relaxed text-amber-800 dark:text-amber-200">
                  {data.report.adjustments}
                </p>
              </div>
            )}

            {nextWeekTasks.length > 0 && (
              <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                <p className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  下周计划（AI 建议）
                </p>
                <ul className="mb-4 space-y-2">
                  {nextWeekTasks.map((task, i) => (
                    <li key={i} className="flex items-start justify-between gap-2 text-sm">
                      <span className="min-w-0">
                        <span className="mr-1.5 rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                          {dayNames[task.day - 1]}
                        </span>
                        <span className="font-medium text-zinc-800 dark:text-zinc-200">
                          {task.title}
                        </span>
                        <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                          {task.detail}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-zinc-400">
                        {task.minutes}分钟
                      </span>
                    </li>
                  ))}
                </ul>

                {data.nextWeekConfirmed ? (
                  <p className="flex min-h-[44px] items-center justify-center rounded-xl bg-emerald-50 text-sm font-medium text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
                    ✓ 下周任务已入库
                  </p>
                ) : (
                  <>
                    <div className="mb-3 flex gap-2">
                      <input
                        type="text"
                        value={weekInstruction}
                        onChange={(e) => setWeekInstruction(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !revisingWeek) reviseNextWeek();
                        }}
                        placeholder="对下周计划提调整指令，如「周三减少一项」"
                        className="w-full rounded-lg border border-zinc-200 bg-white p-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
                      />
                      <button
                        onClick={reviseNextWeek}
                        disabled={revisingWeek || !weekInstruction.trim()}
                        className="flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {revisingWeek && <Spinner className="h-3 w-3" />}
                        {revisingWeek ? "调整中…" : "AI 调整"}
                      </button>
                    </div>
                    <button
                      onClick={confirmNextWeek}
                      disabled={confirming}
                      className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-base font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {confirming && <Spinner />}
                      {confirming ? "入库中..." : "确认下周计划，生成任务"}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">
              {weekTotal > 0
                ? "按下一周报，AI 会结合你的打卡记录评估进度风险，并给出下周计划"
                : "本周暂无任务，无法生成周报"}
            </p>
            <button
              onClick={generateReport}
              disabled={generating || weekTotal === 0}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-base font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {generating && <Spinner />}
              {generating ? "AI 复盘中，约需 1 分钟..." : "生成本周周报"}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
