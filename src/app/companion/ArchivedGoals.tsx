"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { restoreGoalAction } from "@/modules/companion/actions";

export interface ArchivedGoalItem {
  id: string;
  title: string;
  categoryLabel: string;
  deadlineLabel: string;
}

export function ArchivedGoals({ goals }: { goals: ArchivedGoalItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function restore(goalId: string) {
    startTransition(async () => {
      await restoreGoalAction(goalId);
      setConfirmingId(null);
      router.refresh();
    });
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex min-h-[44px] w-full items-center justify-between gap-3 px-5 py-3 text-left"
      >
        <span className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
          已归档目标
          <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
            {goals.length}
          </span>
        </span>
        <span
          aria-hidden
          className={`text-zinc-400 transition-transform ${open ? "rotate-90" : ""}`}
        >
          ›
        </span>
      </button>

      {open && (
        <ul className="border-t border-zinc-100 dark:border-zinc-800">
          {goals.map((goal) => (
            <li
              key={goal.id}
              className="flex flex-wrap items-center gap-2 px-5 py-3 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-zinc-100 dark:[&:not(:last-child)]:border-zinc-800"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium text-zinc-700 dark:text-zinc-200">
                    {goal.title}
                  </p>
                  <span className="shrink-0 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-medium text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">
                    {goal.categoryLabel}
                  </span>
                </div>
                <p className="text-xs text-zinc-400 dark:text-zinc-500">
                  截止 {goal.deadlineLabel}
                </p>
              </div>

              {confirmingId === goal.id ? (
                <div className="flex w-full flex-wrap items-center gap-2">
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    恢复后回到进行中列表
                  </span>
                  <button
                    onClick={() => restore(goal.id)}
                    disabled={pending}
                    className="min-h-[44px] rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                  >
                    {pending ? "恢复中…" : "确认恢复"}
                  </button>
                  <button
                    onClick={() => setConfirmingId(null)}
                    disabled={pending}
                    className="min-h-[44px] rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
                  >
                    取消
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmingId(goal.id)}
                  className="min-h-[44px] shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-indigo-600 transition hover:bg-indigo-50 active:scale-[0.98] dark:text-indigo-400 dark:hover:bg-indigo-900/20"
                >
                  恢复
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
