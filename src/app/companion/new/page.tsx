"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BackLink } from "@/app/_components/BackLink";

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

const categories = [
  { value: "exam", label: "考试", emoji: "📝" },
  { value: "project", label: "项目", emoji: "🛠️" },
  { value: "habit", label: "习惯", emoji: "🌱" },
];

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

export default function CompanionNewPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("exam");
  const [deadline, setDeadline] = useState("");
  const [dailyMinutes, setDailyMinutes] = useState("");
  const [userContext, setUserContext] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const todayStr = new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD 本地日期

  const step1Valid = title.trim() && deadline && Number(dailyMinutes) > 0;

  function handleStep1Submit(e: React.FormEvent) {
    e.preventDefault();
    if (step1Valid) setStep(2);
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!userContext.trim()) return;

    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/companion/generate-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          category,
          deadline,
          dailyMinutes: Number(dailyMinutes),
          userContext: userContext.trim(),
        }),
      });
      const result = (await res.json()) as {
        code: number;
        data: { plan: PlanDraft["plan"] } | null;
        msg: string;
      };

      if (result.code !== 0 || !result.data) {
        throw new Error(result.msg || "生成计划失败");
      }

      const draft: PlanDraft = {
        form: {
          title: title.trim(),
          category,
          deadline,
          dailyMinutes: Number(dailyMinutes),
          userContext: userContext.trim(),
        },
        plan: result.data.plan,
      };
      sessionStorage.setItem(PLAN_DRAFT_KEY, JSON.stringify(draft));
      router.push("/companion/new/preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  }

  const inputClass =
    "w-full rounded-xl border border-zinc-200 bg-white p-3 text-base text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50";

  return (
    <main className="min-h-svh bg-zinc-50 px-4 py-6 dark:bg-black sm:px-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6">
          <BackLink href="/companion">返回陪伴模块</BackLink>
        </div>

        <div className="mb-6 flex items-center gap-2">
          <span
            className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${
              step >= 1
                ? "bg-indigo-600 text-white"
                : "bg-zinc-200 text-zinc-500 dark:bg-zinc-800"
            }`}
          >
            1
          </span>
          <span className="text-sm text-zinc-500 dark:text-zinc-400">目标信息</span>
          <div className="mx-1 h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
          <span
            className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${
              step >= 2
                ? "bg-indigo-600 text-white"
                : "bg-zinc-200 text-zinc-500 dark:bg-zinc-800"
            }`}
          >
            2
          </span>
          <span className="text-sm text-zinc-500 dark:text-zinc-400">现状自述</span>
        </div>

        <h1 className="mb-6 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          开始一个新目标
        </h1>

        {step === 1 && (
          <form onSubmit={handleStep1Submit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                目标名称
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例如：备战英语四级"
                className={inputClass}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                类别
              </label>
              <div className="grid grid-cols-3 gap-2">
                {categories.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setCategory(c.value)}
                    className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border px-3 text-sm font-medium transition ${
                      category === c.value
                        ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
                        : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"
                    }`}
                  >
                    <span>{c.emoji}</span>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                截止日期
              </label>
              <input
                type="date"
                value={deadline}
                min={todayStr}
                onChange={(e) => setDeadline(e.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                每日可投入（分钟）
              </label>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={1440}
                value={dailyMinutes}
                onChange={(e) => setDailyMinutes(e.target.value)}
                placeholder="例如：60"
                className={inputClass}
              />
            </div>

            <button
              type="submit"
              disabled={!step1Valid}
              className="w-full rounded-xl bg-indigo-600 px-5 py-3.5 text-base font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              下一步
            </button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleGenerate} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                现状自述
              </label>
              <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
                说得越具体，计划越贴合你。比如考四级：高考英语110分，词汇量约3000，听力最弱
              </p>
              <textarea
                value={userContext}
                onChange={(e) => setUserContext(e.target.value)}
                rows={8}
                placeholder="例如：高考英语110分，词汇量约3000，听力最弱，平时课多只有晚上能学..."
                className={inputClass}
              />
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="rounded-xl border border-zinc-200 bg-white px-5 py-3.5 text-base font-medium text-zinc-700 transition hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
              >
                上一步
              </button>
              <button
                type="submit"
                disabled={loading || !userContext.trim()}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3.5 text-base font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading && <Spinner />}
                {loading ? "AI 规划中，约需 1 分钟..." : "让 AI 生成计划"}
              </button>
            </div>
          </form>
        )}

        {error && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
            <p className="font-medium">出错了</p>
            <pre className="mt-2 whitespace-pre-wrap">{error}</pre>
          </div>
        )}
      </div>
    </main>
  );
}
