"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listMaterialsForReset, resetTodayCards, type MaterialOption } from "./actions";

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

export default function ResetTodayPage() {
  const [materials, setMaterials] = useState<MaterialOption[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [result, setResult] = useState<{ updatedCount: number } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    listMaterialsForReset()
      .then((data) => {
        setMaterials(data);
        if (data.length > 0) {
          setSelectedId(data[0].id);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  async function handleReset() {
    if (!selectedId) return;
    if (!confirm("确定重置？这会把选中材料的所有卡片 nextReviewAt 设为现在，并将新卡标记为 learning。")) {
      return;
    }

    setResetting(true);
    setError("");
    setResult(null);

    try {
      const res = await resetTodayCards(selectedId);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setResetting(false);
    }
  }

  const selectedLabel =
    selectedId === "all"
      ? "所有材料"
      : materials.find((m) => m.id === selectedId)?.title ?? "";

  return (
    <main className="min-h-svh bg-zinc-50 px-4 py-8 dark:bg-black sm:px-6">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-2 text-2xl font-bold text-zinc-900 dark:text-zinc-50">重置今日复习</h1>
        <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
          把指定材料的所有卡片 nextReviewAt 设为现在，方便反复测试复习流程。
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
            <Spinner className="h-5 w-5" />
            <span>加载材料列表...</span>
          </div>
        ) : materials.length === 0 ? (
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">还没有材料，先去录入吧。</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                选择材料
              </label>
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-white p-3 text-base text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
              >
                <option value="all">全部材料</option>
                {materials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title}（{m.cardCount} 张卡片）
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleReset}
              disabled={resetting || !selectedId}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 px-5 py-4 text-base font-medium text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {resetting && <Spinner />}
              {resetting ? "重置中..." : `重置「${selectedLabel}」的卡片`}
            </button>

            {result && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-300">
                已重置 {result.updatedCount} 张卡片。现在可以去
                <Link href="/recite/review" className="mx-1 font-semibold underline">
                  复习页
                </Link>
                测试。
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
            <p className="font-medium">出错了</p>
            <pre className="mt-2 whitespace-pre-wrap">{error}</pre>
          </div>
        )}

        <div className="mt-8">
          <Link
            href="/"
            className="text-sm text-zinc-500 transition hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            ← 返回首页
          </Link>
        </div>
      </div>
    </main>
  );
}
