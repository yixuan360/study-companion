"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { leaveClassroomAction } from "@/modules/classroom/actions";

export function LeaveClassroomButton({ classroomId }: { classroomId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function handleLeave() {
    setError("");
    startTransition(async () => {
      const result = await leaveClassroomAction(classroomId);
      if (result.error) {
        setError(result.error);
        setConfirming(false);
        return;
      }
      router.push("/classroom");
      router.refresh();
    });
  }

  return (
    <div className="mt-4">
      {error && (
        <div className="mb-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 flex-1 text-xs text-zinc-500 dark:text-zinc-400">
            退出后将不再接收本班任务提醒，已完成的打卡记录保留在班级数据中
          </span>
          <button
            type="button"
            onClick={handleLeave}
            disabled={pending}
            className="flex min-h-[44px] items-center justify-center rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
          >
            {pending ? "退出中…" : "确认退出"}
          </button>
          <button
            type="button"
            onClick={() => {
              setConfirming(false);
              setError("");
            }}
            disabled={pending}
            className="flex min-h-[44px] items-center justify-center rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300"
          >
            取消
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="flex min-h-[44px] w-full items-center justify-center rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          退出班级
        </button>
      )}
    </div>
  );
}
