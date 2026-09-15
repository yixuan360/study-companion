"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteClassTaskAction } from "@/modules/classroom/actions";

export function TaskDeleteButton({
  classroomId,
  taskId,
}: {
  classroomId: string;
  taskId: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    setError("");
    startTransition(async () => {
      const result = await deleteClassTaskAction(classroomId, taskId);
      if (result.error) {
        setError(result.error);
        setConfirming(false);
        return;
      }
      router.push(`/classroom/${classroomId}`);
      router.refresh();
    });
  }

  if (confirming) {
    return (
      <div className="space-y-3">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
            {error}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 flex-1 text-xs text-red-600 dark:text-red-400">
            删除后全班同学的完成记录也会一并清除，不可恢复
          </span>
          <button
            type="button"
            onClick={handleDelete}
            disabled={pending}
            className="flex min-h-[44px] items-center justify-center rounded-xl bg-red-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "删除中…" : "确认删除"}
          </button>
          <button
            type="button"
            onClick={() => {
              setConfirming(false);
              setError("");
            }}
            disabled={pending}
            className="flex min-h-[44px] items-center justify-center rounded-xl border border-zinc-200 px-5 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            取消
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="flex min-h-[44px] w-full items-center justify-center rounded-xl border border-red-200 px-5 py-3 text-base font-medium text-red-600 transition hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-900/20"
    >
      删除任务
    </button>
  );
}
