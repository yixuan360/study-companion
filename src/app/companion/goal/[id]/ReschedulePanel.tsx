"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  applyRescheduleAction,
  previewRescheduleAction,
} from "@/modules/companion/actions";
import type { ReschedulePreview } from "@/modules/companion/reschedule";

export interface ReschedulePhaseInit {
  id: string;
  name: string;
  order: number;
  weeks: number;
  rangeLabel: string;
}

function mmdd(iso: string): string {
  return iso.slice(5).replace("-", "/");
}

export function ReschedulePanel({
  goalId,
  phases,
}: {
  goalId: string;
  phases: ReschedulePhaseInit[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [weeks, setWeeks] = useState<string[]>(() => phases.map((p) => String(p.weeks)));
  const [preview, setPreview] = useState<ReschedulePreview | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function editWeek(index: number, value: string) {
    setWeeks((prev) => prev.map((w, i) => (i === index ? value : w)));
    setPreview(null); // 修改后旧预览失效
    setError("");
  }

  function parseWeeks(): number[] | null {
    const parsed = weeks.map((w) => Number(w));
    if (parsed.some((w) => !Number.isInteger(w) || w < 1)) return null;
    return parsed;
  }

  function generate() {
    const parsed = parseWeeks();
    if (!parsed) {
      setError("每周数应为不小于 1 的整数");
      return;
    }
    setError("");
    startTransition(async () => {
      try {
        setPreview(await previewRescheduleAction(goalId, parsed));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  function apply() {
    const parsed = parseWeeks();
    if (!parsed) {
      setError("每周数应为不小于 1 的整数");
      return;
    }
    setError("");
    startTransition(async () => {
      try {
        await applyRescheduleAction(goalId, parsed);
        setOpen(false);
        setPreview(null);
        setWeeks(phases.map((p) => String(p.weeks))); // router.refresh 后会被新 props 取代
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex min-h-[44px] items-center gap-1 rounded-lg px-3 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 active:scale-[0.98] dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        调整阶段
      </button>
    );
  }

  const noChanges =
    preview !== null &&
    preview.phaseChangeCount === 0 &&
    preview.dueChangeCount === 0 &&
    preview.migrateCount === 0;

  return (
    <div className="mb-4 rounded-2xl border border-indigo-200 bg-white p-4 dark:border-indigo-900/50 dark:bg-zinc-900">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          调整阶段周数
        </p>
        <button
          onClick={() => {
            setOpen(false);
            setPreview(null);
            setError("");
          }}
          disabled={pending}
          className="min-h-[44px] rounded-lg px-3 text-sm text-zinc-500 transition hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          收起
        </button>
      </div>

      <p className="mb-3 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
        修改各阶段周数，后续阶段将连锁平移；任务原则上保留原日期、按新区间重新归属阶段，超出范围的自动收敛。生成变更计划确认后才落库。
      </p>

      <ul className="mb-3 space-y-2">
        {phases.map((phase, i) => (
          <li
            key={phase.id}
            className="flex items-center gap-3 rounded-xl border border-zinc-100 p-3 dark:border-zinc-800"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
              {phase.order}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">
                {phase.name}
              </p>
              <p className="text-xs text-zinc-400 dark:text-zinc-500">
                当前 {phase.rangeLabel}
              </p>
            </div>
            <label className="flex shrink-0 items-center gap-1.5 text-sm text-zinc-500 dark:text-zinc-400">
              <input
                type="number"
                min={1}
                max={52}
                value={weeks[i]}
                onChange={(e) => editWeek(i, e.target.value)}
                aria-label={`${phase.name}周数`}
                className="w-16 rounded-lg border border-zinc-200 bg-white p-2 text-center text-base text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
              />
              周
            </label>
          </li>
        ))}
      </ul>

      {error && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </p>
      )}

      {preview && (
        <div className="mb-3 rounded-xl border border-zinc-100 p-3 dark:border-zinc-800">
          <p className="mb-2 text-sm font-medium text-zinc-900 dark:text-zinc-50">
            变更计划：
            {noChanges
              ? "没有需要变更的内容"
              : `${preview.phaseChangeCount} 个阶段日期变更 · ${preview.dueChangeCount} 个任务改期 · ${preview.migrateCount} 个任务变更归属`}
          </p>

          {!noChanges && (
            <div className="space-y-2">
              {preview.phases
                .filter((p) => p.changed)
                .map((p) => (
                  <p key={p.id} className="text-xs text-zinc-600 dark:text-zinc-300">
                    <span className="font-medium">阶段「{p.name}」</span> {p.oldRange} →{" "}
                    <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                      {p.newRange}
                    </span>
                  </p>
                ))}

              {preview.taskChanges.length > 0 && (
                <ul className="space-y-1.5 border-t border-zinc-100 pt-2 dark:border-zinc-800">
                  {preview.taskChanges.map((t) => (
                    <li key={t.id} className="text-xs text-zinc-600 dark:text-zinc-300">
                      <span className="font-medium">「{t.title}」</span>
                      {t.oldDueDate !== t.newDueDate && (
                        <>
                          {" "}
                          改期 {mmdd(t.oldDueDate)} →{" "}
                          <span className="font-semibold">{mmdd(t.newDueDate)}</span>
                        </>
                      )}
                      {t.oldPhaseName !== t.newPhaseName && (
                        <>
                          {" "}
                          归属 {t.oldPhaseName} →{" "}
                          <span className="font-semibold">{t.newPhaseName}</span>
                        </>
                      )}
                      <span className="block text-zinc-400 dark:text-zinc-500">
                        {t.reason}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2">
        {preview && !noChanges ? (
          <>
            <button
              onClick={apply}
              disabled={pending}
              className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
            >
              {pending ? "落库中…" : "确认落库"}
            </button>
            <button
              onClick={() => setPreview(null)}
              disabled={pending}
              className="min-h-[44px] rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300"
            >
              返回修改
            </button>
          </>
        ) : (
          <button
            onClick={generate}
            disabled={pending}
            className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
          >
            {pending ? "计算中…" : "生成变更计划"}
          </button>
        )}
      </div>
    </div>
  );
}
