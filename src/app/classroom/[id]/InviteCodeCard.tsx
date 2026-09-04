"use client";

import { useState } from "react";

export function InviteCodeCard({
  classroomName,
  inviteCode,
}: {
  classroomName: string;
  inviteCode: string;
}) {
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  const inviteLink =
    typeof window === "undefined"
      ? ""
      : `${window.location.origin}/classroom/join?code=${inviteCode}`;

  async function copy(text: string, kind: "code" | "link") {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // 剪贴板不可用（非安全上下文等）时退回 execCommand
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopied(kind);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4 dark:border-indigo-900/50 dark:bg-indigo-900/10">
      <p className="mb-1 text-xs font-medium text-indigo-700 dark:text-indigo-300">
        {classroomName} · 邀请码
      </p>
      <div className="flex items-center gap-3">
        <p className="font-mono text-2xl font-bold tracking-[0.2em] text-indigo-700 dark:text-indigo-200">
          {inviteCode}
        </p>
        <button
          onClick={() => copy(inviteCode, "code")}
          className="min-h-[36px] rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-sm font-medium text-indigo-700 transition hover:border-indigo-300 dark:border-indigo-900/50 dark:bg-indigo-900/30 dark:text-indigo-200"
        >
          {copied === "code" ? "已复制 ✓" : "复制邀请码"}
        </button>
      </div>
      <div className="mt-3 flex items-center gap-2 border-t border-indigo-100 pt-3 dark:border-indigo-900/40">
        <p className="min-w-0 flex-1 truncate text-xs text-indigo-600/80 dark:text-indigo-300/80">
          邀请链接：{inviteLink || `/classroom/join?code=${inviteCode}`}
        </p>
        <button
          onClick={() => copy(inviteLink || `/classroom/join?code=${inviteCode}`, "link")}
          className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100 dark:text-indigo-300 dark:hover:bg-indigo-900/30"
        >
          {copied === "link" ? "已复制 ✓" : "复制链接"}
        </button>
      </div>
    </div>
  );
}
