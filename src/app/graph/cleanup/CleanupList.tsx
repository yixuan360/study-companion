"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteCleanupNodeAction,
  restoreCleanupNodeAction,
} from "@/modules/graph/actions";

export interface CleanupItem {
  id: string;
  name: string;
  domain: string;
  summary: string;
  markedAtLabel: string | null;
}

export function CleanupList({ items }: { items: CleanupItem[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [, startTransition] = useTransition();

  function run(item: CleanupItem, action: (id: string) => Promise<void>) {
    setError("");
    setPendingId(item.id);
    startTransition(async () => {
      try {
        await action(item.id);
        setConfirmingId(null);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setPendingId(null);
      }
    });
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}
      {items.map((item) => (
        <div
          key={item.id}
          className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="mb-1 flex items-center gap-2">
            <p className="font-semibold text-zinc-900 dark:text-zinc-50">
              {item.name}
            </p>
            <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
              {item.domain}
            </span>
            {item.markedAtLabel && (
              <span className="text-xs text-zinc-400 dark:text-zinc-500">
                标记于 {item.markedAtLabel}
              </span>
            )}
          </div>
          <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-300">
            {item.summary}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => run(item, restoreCleanupNodeAction)}
              disabled={pendingId === item.id}
              className="min-h-[44px] flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:border-zinc-300 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
            >
              恢复（提及重置为 1）
            </button>
            {confirmingId === item.id ? (
              <button
                onClick={() => run(item, deleteCleanupNodeAction)}
                disabled={pendingId === item.id}
                className="min-h-[44px] flex-1 rounded-xl bg-red-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                {pendingId === item.id ? "删除中..." : "确认删除？不可撤销"}
              </button>
            ) : (
              <button
                onClick={() => setConfirmingId(item.id)}
                disabled={pendingId === item.id}
                className="min-h-[44px] flex-1 rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 transition hover:border-red-300 disabled:opacity-50 dark:border-red-900/50 dark:bg-zinc-900 dark:text-red-300"
              >
                删除
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
