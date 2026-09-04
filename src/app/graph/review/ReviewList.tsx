"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  resolveReviewAction,
  type ReviewResolution,
} from "@/modules/graph/actions";

export interface ReviewItem {
  id: string;
  createdAtLabel: string;
  fromName: string;
  toName: string;
  existingRelation: string;
  incomingRelation: string;
  incomingExcerpt: string;
  sourceTitle: string;
  sourceId: string;
}

export function ReviewList({ items }: { items: ReviewItem[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [, startTransition] = useTransition();

  function resolve(item: ReviewItem, resolution: ReviewResolution) {
    setError("");
    setPendingId(item.id);
    startTransition(async () => {
      try {
        await resolveReviewAction(
          item.id,
          resolution,
          resolution === "keepBoth" ? note : undefined
        );
        setNote("");
        setNoteFor(null);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setPendingId(null);
      }
    });
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}
      {items.map((item) => (
        <div
          key={item.id}
          className="rounded-2xl border border-amber-200 bg-white p-4 dark:border-amber-900/50 dark:bg-zinc-900"
        >
          <p className="mb-2 text-sm text-zinc-800 dark:text-zinc-200">
            <span className="font-semibold">{item.fromName}</span> 与{" "}
            <span className="font-semibold">{item.toName}</span>{" "}
            的关系出现冲突：
          </p>
          <div className="mb-3 space-y-1.5 rounded-xl bg-amber-50 p-3 text-sm dark:bg-amber-900/20">
            <p className="text-amber-800 dark:text-amber-200">
              已有关系：
              <span className="mx-1 rounded bg-amber-200 px-1.5 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                {item.existingRelation}
              </span>
            </p>
            <p className="text-amber-800 dark:text-amber-200">
              新增关系：
              <span className="mx-1 rounded bg-violet-200 px-1.5 py-0.5 text-xs font-medium text-violet-900 dark:bg-violet-900/40 dark:text-violet-200">
                {item.incomingRelation}
              </span>
            </p>
            {item.incomingExcerpt && (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                新增依据：「{item.incomingExcerpt}」
              </p>
            )}
            {item.sourceId && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                来自{" "}
                <Link
                  href={`/graph/sources/${item.sourceId}`}
                  className="underline"
                >
                  {item.sourceTitle}
                </Link>{" "}
                · {item.createdAtLabel}
              </p>
            )}
          </div>

          {noteFor === item.id ? (
            <div className="space-y-2">
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="备注：两者共存的原因，如 分别在不同语境下成立"
                className="w-full rounded-xl border border-zinc-200 bg-white p-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setNoteFor(null);
                    setNote("");
                  }}
                  className="min-h-[40px] rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
                >
                  取消
                </button>
                <button
                  onClick={() => resolve(item, "keepBoth")}
                  disabled={pendingId === item.id}
                  className="min-h-[40px] flex-1 rounded-xl bg-zinc-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {pendingId === item.id ? "处理中..." : "确认共存"}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => resolve(item, "keepOld")}
                disabled={pendingId === item.id}
                className="min-h-[40px] flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:border-zinc-300 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
              >
                保留旧关系
              </button>
              <button
                onClick={() => resolve(item, "takeNew")}
                disabled={pendingId === item.id}
                className="min-h-[40px] flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:border-zinc-300 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
              >
                采用新关系
              </button>
              <button
                onClick={() => setNoteFor(item.id)}
                disabled={pendingId === item.id}
                className="min-h-[40px] flex-1 rounded-xl bg-violet-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-violet-700 disabled:opacity-50"
              >
                两者共存
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
