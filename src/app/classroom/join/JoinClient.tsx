"use client";

import { useEffect, useState } from "react";
import { joinByInviteCodeAction } from "@/modules/classroom/actions";

export function JoinClient({ code }: { code: string }) {
  const [error, setError] = useState("");
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await joinByInviteCodeAction(code);
        if (!cancelled) setJoined(true);
      } catch (err) {
        // redirect 抛出的 NEXT_REDIRECT 属正常流程，其余为真实错误
        const digest = (err as { digest?: string })?.digest;
        if (digest?.startsWith?.("NEXT_REDIRECT")) throw err;
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (error) {
    return (
      <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
        {error}
      </div>
    );
  }

  return (
    <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
      {joined ? "已加入，正在跳转..." : "正在加入班级..."}
    </p>
  );
}
