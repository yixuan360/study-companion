"use client";

import { useState } from "react";
import { sendDailyReminderAction } from "@/modules/recite/actions";

export function SendReminderButton() {
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  async function handleSend() {
    setSending(true);
    setFeedback(null);
    try {
      const result = await sendDailyReminderAction();
      setFeedback(
        result.success
          ? { ok: true, text: `已推送：今日 ${result.dueCount} 张待复习` }
          : { ok: false, text: `推送失败：${result.error ?? "未知原因"}` }
      );
    } catch (err) {
      setFeedback({
        ok: false,
        text: `推送失败：${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleSend}
        disabled={sending}
        className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 active:scale-[0.98] disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        {sending ? "推送中..." : "推送今日复习提醒到微信"}
      </button>
      {feedback && (
        <p
          className={`text-xs ${feedback.ok ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}
        >
          {feedback.text}
        </p>
      )}
    </div>
  );
}
