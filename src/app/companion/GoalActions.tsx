"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { archiveGoalAction, deleteGoalAction } from "@/modules/companion/actions";

export function GoalActions({
  goalId,
  archived = false,
  afterActionHref,
}: {
  goalId: string;
  archived?: boolean;
  afterActionHref?: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<null | "delete" | "archive">(null);
  const [pending, startTransition] = useTransition();

  function run(action: "delete" | "archive") {
    startTransition(async () => {
      if (action === "delete") {
        await deleteGoalAction(goalId);
      } else {
        await archiveGoalAction(goalId);
        router.refresh();
      }
      setConfirming(null);
      if (afterActionHref) router.push(afterActionHref);
    });
  }

  if (confirming === "delete") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-red-600 dark:text-red-400">
          将删除全部阶段、任务与打卡记录，不可恢复
        </span>
        <button
          onClick={() => run("delete")}
          disabled={pending}
          className="min-h-[36px] rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {pending ? "删除中…" : "确认删除"}
        </button>
        <button
          onClick={() => setConfirming(null)}
          disabled={pending}
          className="min-h-[36px] rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
        >
          取消
        </button>
      </div>
    );
  }

  if (confirming === "archive") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          归档后不再显示，数据保留
        </span>
        <button
          onClick={() => run("archive")}
          disabled={pending}
          className="min-h-[36px] rounded-lg bg-zinc-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {pending ? "归档中…" : "确认归档"}
        </button>
        <button
          onClick={() => setConfirming(null)}
          disabled={pending}
          className="min-h-[36px] rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
        >
          取消
        </button>
      </div>
    );
  }

  return (
    <div className="flex gap-1">
      {!archived && (
        <button
          onClick={() => setConfirming("archive")}
          className="min-h-[36px] rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          归档
        </button>
      )}
      <button
        onClick={() => setConfirming("delete")}
        className="min-h-[36px] rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
      >
        删除
      </button>
    </div>
  );
}
