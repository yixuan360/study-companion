"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteSourceAction } from "@/modules/graph/actions";

export function DeleteSourceButton({ sourceId }: { sourceId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  function handleDelete() {
    startTransition(async () => {
      await deleteSourceAction(sourceId);
      router.push("/graph/sources");
    });
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="min-h-[44px] rounded-xl border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-900/20"
      >
        删除来源
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-zinc-500 dark:text-zinc-400">
        节点与关联会保留，仅提及次数-1
      </span>
      <button
        onClick={() => setConfirming(false)}
        disabled={pending}
        className="min-h-[44px] rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-600 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300"
      >
        取消
      </button>
      <button
        onClick={handleDelete}
        disabled={pending}
        className="min-h-[44px] rounded-xl bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
      >
        {pending ? "删除中..." : "确认删除"}
      </button>
    </div>
  );
}
