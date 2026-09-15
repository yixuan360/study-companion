"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { regenerateInviteCodeAction } from "@/modules/classroom/actions";

export function InviteCodeCard({
  classroomId,
  classroomName,
  inviteCode,
  expireLabel,
  isExpired,
  isCreator,
}: {
  classroomId: string;
  classroomName: string;
  inviteCode: string;
  /** 有效期展示文案（服务端格式化好，如 "2026/9/22" / "永久有效"） */
  expireLabel: string;
  isExpired: boolean;
  isCreator: boolean;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

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

  function handleRegenerate() {
    setError("");
    startTransition(async () => {
      const result = await regenerateInviteCodeAction(classroomId);
      if (result.error) {
        setError(result.error);
        setConfirming(false);
        return;
      }
      setConfirming(false);
      router.refresh();
    });
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
      <p
        className={`mt-1 text-xs ${
          isExpired
            ? "font-medium text-red-600 dark:text-red-400"
            : "text-indigo-600/80 dark:text-indigo-300/80"
        }`}
      >
        {isExpired ? `已于 ${expireLabel} 过期，同学无法通过它加入` : `有效期至 ${expireLabel}`}
      </p>
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

      {isCreator && isExpired && (
        <div className="mt-3 border-t border-indigo-100 pt-3 dark:border-indigo-900/40">
          {error && (
            <div className="mb-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
              {error}
            </div>
          )}
          {confirming ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 text-xs text-zinc-600 dark:text-zinc-400">
                重新生成后旧邀请码立即失效
              </span>
              <button
                type="button"
                onClick={handleRegenerate}
                disabled={pending}
                className="flex min-h-[44px] items-center justify-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
              >
                {pending ? "生成中…" : "确认重新生成"}
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
              className="flex min-h-[44px] w-full items-center justify-center rounded-xl border border-indigo-200 bg-white px-4 py-2 text-sm font-medium text-indigo-700 transition hover:border-indigo-300 dark:border-indigo-900/50 dark:bg-indigo-900/30 dark:text-indigo-200"
            >
              重新生成邀请码
            </button>
          )}
        </div>
      )}
    </div>
  );
}
