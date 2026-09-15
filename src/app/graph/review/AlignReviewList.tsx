"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  resolveAlignReviewAction,
  type AlignResolution,
} from "@/modules/graph/actions";

export interface AlignReviewItem {
  id: string;
  createdAtLabel: string;
  entityName: string;
  entitySummary: string;
  entityAliases: string[];
  suggestedName: string;
  aiReason: string;
  sourceTitle: string;
  sourceId: string;
}

export function AlignReviewList({ items }: { items: AlignReviewItem[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [, startTransition] = useTransition();

  function resolve(item: AlignReviewItem, resolution: AlignResolution) {
    setError("");
    setPendingId(item.id);
    startTransition(async () => {
      try {
        await resolveAlignReviewAction(item.id, resolution);
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
          className="rounded-2xl border border-violet-200 bg-white p-4 dark:border-violet-900/50 dark:bg-zinc-900"
        >
          <p className="mb-2 text-sm text-zinc-800 dark:text-zinc-200">
            新知识点{" "}
            <span className="font-semibold">{item.entityName}</span>{" "}
            可能与已有节点{" "}
            <span className="font-semibold">{item.suggestedName}</span>{" "}
            是同一概念（AI 存疑，待人工确认）
          </p>
          <div className="mb-3 space-y-1.5 rounded-xl bg-violet-50 p-3 text-sm dark:bg-violet-900/20">
            <p className="text-violet-900 dark:text-violet-200">
              摘要：{item.entitySummary}
            </p>
            {item.entityAliases.length > 0 && (
              <p className="text-xs text-violet-700 dark:text-violet-300">
                别名：{item.entityAliases.join("、")}
              </p>
            )}
            <p className="text-xs text-violet-700 dark:text-violet-300">
              AI 存疑原因：「{item.aiReason}」
            </p>
            {item.sourceId && (
              <p className="text-xs text-violet-600 dark:text-violet-400">
                来自《{item.sourceTitle}》 · {item.createdAtLabel}
              </p>
            )}
          </div>
          <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
            批准合并：新节点并入「{item.suggestedName}」（提及+1、别名并合≤20、主名不变），
            新节点的关系边与溯源一并迁移后删除新节点；拒绝：维持两个节点各自独立。
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => resolve(item, "reject")}
              disabled={pendingId === item.id}
              className="min-h-[44px] flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:border-zinc-300 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
            >
              拒绝合并
            </button>
            <button
              onClick={() => resolve(item, "approve")}
              disabled={pendingId === item.id}
              className="min-h-[44px] flex-1 rounded-xl bg-violet-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-violet-700 disabled:opacity-50"
            >
              {pendingId === item.id ? "处理中..." : "批准合并"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
