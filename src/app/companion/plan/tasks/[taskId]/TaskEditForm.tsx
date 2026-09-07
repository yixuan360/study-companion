"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function TaskEditForm({
  taskId,
  goalId,
  initialTitle,
  initialDetail,
  initialMinutes,
  initialDueDate,
  status,
}: {
  taskId: string;
  goalId: string;
  initialTitle: string;
  initialDetail: string;
  initialMinutes: number;
  initialDueDate: string;
  status: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [detail, setDetail] = useState(initialDetail);
  const [minutes, setMinutes] = useState(String(initialMinutes));
  const [dueDate, setDueDate] = useState(initialDueDate);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState("");

  const backHref = `/companion/plan?goalId=${goalId}`;

  const inputClass =
    "w-full rounded-lg border border-zinc-200 bg-white p-2.5 text-base text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50";

  async function save() {
    setError("");
    setSaving(true);
    try {
      const res = await fetch(`/api/companion/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          detail: detail.trim(),
          estMinutes: Number(minutes),
          dueDate,
        }),
      });
      const result = (await res.json()) as { code: number; msg: string };
      if (result.code !== 0) {
        throw new Error(result.msg || "保存失败");
      }
      router.push(backHref);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  async function remove() {
    setError("");
    setDeleting(true);
    try {
      const res = await fetch(`/api/companion/tasks/${taskId}`, { method: "DELETE" });
      const result = (await res.json()) as { code: number; msg: string };
      if (result.code !== 0) {
        throw new Error(result.msg || "删除失败");
      }
      router.push(backHref);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          任务标题
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={inputClass}
        />

        <label className="mb-1 mt-4 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          怎么做、做到什么程度
        </label>
        <textarea
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          rows={4}
          className={inputClass}
        />

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              预计分钟
            </label>
            <input
              type="number"
              min={5}
              max={1440}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              到期日
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        {status !== "pending" && (
          <p className="mt-3 text-xs text-zinc-400 dark:text-zinc-500">
            该任务已打卡（{status === "done" ? "已完成" : "已跳过"}），编辑内容不影响打卡状态
          </p>
        )}
      </div>

      <button
        onClick={save}
        disabled={saving || !title.trim() || !detail.trim() || !dueDate}
        className="flex min-h-[44px] w-full items-center justify-center rounded-xl bg-indigo-600 px-5 py-3 text-base font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? "保存中..." : "保存修改"}
      </button>

      {confirmingDelete ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-900/20">
          <p className="mb-3 text-sm text-red-700 dark:text-red-300">
            删除后不可恢复，确定删除该任务？
          </p>
          <div className="flex gap-2">
            <button
              onClick={remove}
              disabled={deleting}
              className="min-h-[44px] flex-1 rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? "删除中..." : "确认删除"}
            </button>
            <button
              onClick={() => setConfirmingDelete(false)}
              disabled={deleting}
              className="min-h-[44px] flex-1 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
            >
              取消
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setConfirmingDelete(true)}
          className="min-h-[44px] w-full rounded-xl border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-900/20"
        >
          删除该任务
        </button>
      )}
    </div>
  );
}
