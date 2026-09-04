"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BackLink } from "@/app/_components/BackLink";
import {
  computePhaseDates,
  computeTaskDueDate,
  startOfToday,
} from "@/modules/companion/plan";

const PLAN_DRAFT_KEY = "companion:planDraft";

interface PlanDraft {
  form: {
    title: string;
    category: string;
    deadline: string;
    dailyMinutes: number;
    userContext: string;
  };
  plan: {
    assessment: string;
    phases: { name: string; weeks: number; focus: string; exitCriteria: string }[];
    week1Tasks: { day: number; title: string; detail: string; minutes: number }[];
  };
}

const categoryLabels: Record<string, string> = {
  exam: "考试",
  project: "项目",
  habit: "习惯",
};

const weekdayLabels = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function formatDate(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

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

export default function PlanPreviewPage() {
  const router = useRouter();
  const [draft, setDraft] = useState<PlanDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // sessionStorage 只在客户端存在，必须在挂载后读取，否则 SSR 水合不一致
    const raw = sessionStorage.getItem(PLAN_DRAFT_KEY);
    if (raw) {
      try {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setDraft(JSON.parse(raw) as PlanDraft);
      } catch {
        setDraft(null);
      }
    }
    setLoading(false);
  }, []);

  function updatePhaseName(index: number, name: string) {
    if (!draft) return;
    setDraft({
      ...draft,
      plan: {
        ...draft.plan,
        phases: draft.plan.phases.map((p, i) =>
          i === index ? { ...p, name } : p
        ),
      },
    });
  }

  function updateTask(index: number, field: "title" | "detail" | "minutes", value: string) {
    if (!draft) return;
    setDraft({
      ...draft,
      plan: {
        ...draft.plan,
        week1Tasks: draft.plan.week1Tasks.map((t, i) =>
          i === index
            ? field === "minutes"
              ? { ...t, minutes: Number(value) || 0 }
              : { ...t, [field]: value }
            : t
        ),
      },
    });
  }

  function deleteTask(index: number) {
    if (!draft) return;
    setDraft({
      ...draft,
      plan: {
        ...draft.plan,
        week1Tasks: draft.plan.week1Tasks.filter((_, i) => i !== index),
      },
    });
  }

  async function handleConfirm() {
    if (!draft) return;
    setError("");
    setSaving(true);

    try {
      const res = await fetch("/api/companion/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...draft.form,
          assessment: draft.plan.assessment,
          phases: draft.plan.phases,
          week1Tasks: draft.plan.week1Tasks,
        }),
      });
      const result = (await res.json()) as {
        code: number;
        data: { goalId: string } | null;
        msg: string;
      };
      if (result.code !== 0 || !result.data) {
        throw new Error(result.msg || "保存失败");
      }
      sessionStorage.removeItem(PLAN_DRAFT_KEY);
      router.push("/companion");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-svh bg-zinc-50 px-4 py-6 dark:bg-black sm:px-6">
        <div className="mx-auto max-w-2xl" />
      </main>
    );
  }

  if (!draft) {
    return (
      <main className="min-h-svh bg-zinc-50 px-4 py-6 dark:bg-black sm:px-6">
        <div className="mx-auto max-w-2xl">
          <div className="mb-6">
            <BackLink href="/companion">返回陪伴模块</BackLink>
          </div>
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center dark:border-zinc-700 dark:bg-zinc-900">
            <div className="mb-3 text-4xl">📋</div>
            <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
              没有待确认的计划，请先填写目标信息让 AI 生成
            </p>
            <Link
              href="/companion/new"
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-indigo-600 px-6 text-base font-medium text-white transition hover:bg-indigo-700"
            >
              去创建目标
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const { form, plan } = draft;
  const today = startOfToday();
  const phaseDates = computePhaseDates(plan.phases, today);

  const inputClass =
    "w-full rounded-lg border border-zinc-200 bg-white p-2 text-base text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50";

  return (
    <main className="min-h-svh bg-zinc-50 px-4 py-6 pb-32 dark:bg-black sm:px-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6">
          <BackLink href="/companion/new">返回修改目标信息</BackLink>
        </div>

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">计划预览</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            阶段名和任务都可以修改，确认后才开始执行
          </p>
        </div>

        <div className="mb-6 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-2 flex items-start justify-between gap-3">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              {form.title}
            </h2>
            <span className="shrink-0 rounded-full bg-sky-100 px-2.5 py-1 text-xs font-medium text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">
              {categoryLabels[form.category] ?? form.category}
            </span>
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            截止 {form.deadline} · 每日可投入 {form.dailyMinutes} 分钟
          </p>
        </div>

        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            差距评估
          </h2>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200">
            {plan.assessment}
          </div>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            阶段划分
          </h2>
          <div className="space-y-3">
            {plan.phases.map((phase, i) => (
              <div
                key={i}
                className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="mb-2 flex items-center gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                    {i + 1}
                  </span>
                  <input
                    type="text"
                    value={phase.name}
                    onChange={(e) => updatePhaseName(i, e.target.value)}
                    className="flex-1 rounded-lg border border-transparent bg-transparent p-1.5 text-base font-medium text-zinc-900 hover:border-zinc-200 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:text-zinc-50 dark:hover:border-zinc-700 dark:focus:border-indigo-500"
                    aria-label="阶段名"
                  />
                </div>
                <p className="mb-1 text-xs text-zinc-400 dark:text-zinc-500">
                  {formatDate(phaseDates[i].startDate)} ~ {formatDate(phaseDates[i].endDate)} ·{" "}
                  {phase.weeks} 周
                </p>
                <p className="text-sm text-zinc-700 dark:text-zinc-300">{phase.focus}</p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  结束标志：{phase.exitCriteria}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              第一周任务
            </h2>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {plan.week1Tasks.length} 项 · 从今天开始
            </span>
          </div>
          {plan.week1Tasks.length === 0 && (
            <div className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
              任务已全部删除，至少保留一项才能开始
            </div>
          )}
          <div className="space-y-3">
            {plan.week1Tasks.map((task, i) => {
              const dueDate = computeTaskDueDate(task.day, today);
              return (
                <TaskPreview
                  key={i}
                  task={task}
                  dayLabel={`第${task.day}天 · ${weekdayLabels[dueDate.getDay()]} ${formatDate(dueDate)}`}
                  onUpdate={(field, value) => updateTask(i, field, value)}
                  onDelete={() => deleteTask(i)}
                  inputClass={inputClass}
                />
              );
            })}
          </div>
        </section>

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
            <p className="font-medium">保存失败</p>
            <pre className="mt-2 whitespace-pre-wrap">{error}</pre>
          </div>
        )}

        <div className="fixed inset-x-0 bottom-0 border-t border-zinc-200 bg-white/95 p-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95 sm:static sm:rounded-2xl sm:border">
          <button
            onClick={handleConfirm}
            disabled={saving || plan.week1Tasks.length === 0}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-4 text-base font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving && <Spinner />}
            {saving ? "创建中..." : "确认开始，创建目标"}
          </button>
        </div>
      </div>
    </main>
  );
}

function TaskPreview({
  task,
  dayLabel,
  onUpdate,
  onDelete,
  inputClass,
}: {
  task: { day: number; title: string; detail: string; minutes: number };
  dayLabel: string;
  onUpdate: (field: "title" | "detail" | "minutes", value: string) => void;
  onDelete: () => void;
  inputClass: string;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
          {dayLabel}
        </span>
        <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
          约 {task.minutes} 分钟
        </span>
      </div>
      {editing ? (
        <div className="space-y-2">
          <input
            type="text"
            value={task.title}
            onChange={(e) => onUpdate("title", e.target.value)}
            className={inputClass}
          />
          <textarea
            value={task.detail}
            onChange={(e) => onUpdate("detail", e.target.value)}
            rows={3}
            className={inputClass}
          />
          <input
            type="number"
            min={5}
            value={task.minutes}
            onChange={(e) => onUpdate("minutes", e.target.value)}
            className={inputClass}
          />
        </div>
      ) : (
        <div className="space-y-1">
          <p className="font-medium text-zinc-900 dark:text-zinc-50">{task.title}</p>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{task.detail}</p>
        </div>
      )}
      <div className="mt-3 flex justify-end gap-2">
        <button
          onClick={() => setEditing(!editing)}
          className="min-h-[36px] rounded-lg px-4 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          {editing ? "完成" : "编辑"}
        </button>
        <button
          onClick={onDelete}
          className="min-h-[36px] rounded-lg px-4 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
        >
          删除
        </button>
      </div>
    </div>
  );
}
