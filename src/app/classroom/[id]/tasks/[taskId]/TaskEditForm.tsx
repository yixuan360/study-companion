"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CLASS_TASK_TYPE_LABELS,
  PLATFORM_OPTIONS,
} from "@/modules/classroom/tasks";

interface TaskData {
  id: string;
  title: string;
  detail: string;
  platform: string;
  course: string;
  type: "homework" | "exam" | "activity" | "notice";
  deadlineISO: string;
}

interface TaskMeta {
  createdByName: string;
  createdAtLabel: string;
  updatedByName: string | null;
  updatedAtLabel: string | null;
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
}

const inputClass =
  "w-full rounded-xl border border-zinc-200 bg-white p-3 text-base text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50";

export function TaskEditForm({
  classroomId,
  task,
  meta,
}: {
  classroomId: string;
  task: TaskData;
  meta: TaskMeta;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(task.title);
  const [detail, setDetail] = useState(task.detail);
  const [deadline, setDeadline] = useState(toLocalInput(task.deadlineISO));
  const [platform, setPlatform] = useState(task.platform);
  const [course, setCourse] = useState(task.course);
  const [type, setType] = useState(task.type);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const res = await fetch(`/api/classroom/${classroomId}/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          detail,
          deadline: deadline.replace("T", " "),
          platform,
          course: course || null,
          type,
        }),
      });
      const result = (await res.json()) as { code: number; msg: string };
      if (result.code !== 0) {
        throw new Error(result.msg || "保存失败");
      }
      router.push(`/classroom/${classroomId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          任务标题
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          className={inputClass}
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          具体要求
        </label>
        <textarea
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          rows={4}
          required
          className={inputClass}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            截止时间
          </label>
          <input
            type="datetime-local"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            required
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            提交平台
          </label>
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            className={inputClass}
          >
            {!PLATFORM_OPTIONS.includes(platform) && (
              <option value={platform}>{platform}</option>
            )}
            {PLATFORM_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            课程名（选填）
          </label>
          <input
            type="text"
            value={course}
            onChange={(e) => setCourse(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            类型
          </label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as TaskData["type"])}
            className={inputClass}
          >
            {Object.entries(CLASS_TASK_TYPE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={saving}
        className="flex min-h-[44px] w-full items-center justify-center rounded-xl bg-indigo-600 px-5 py-3 text-base font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? "保存中..." : "保存修改"}
      </button>

      <div className="rounded-xl border border-zinc-200 bg-white p-4 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
        <p>
          录入人：{meta.createdByName}（{meta.createdAtLabel}）
        </p>
        {meta.updatedByName && meta.updatedAtLabel && (
          <p className="mt-1">
            最后修改：{meta.updatedByName}（{meta.updatedAtLabel}）
          </p>
        )}
      </div>
    </form>
  );
}
