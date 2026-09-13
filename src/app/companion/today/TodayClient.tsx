"use client";

import { startTransition, useOptimistic, useState } from "react";
import { useRouter } from "next/navigation";

interface TaskDTO {
  id: string;
  title: string;
  detail: string;
  estMinutes: number;
  status: "pending" | "done" | "skipped";
  resultNote: string | null;
}

export interface TodaySection {
  goalId: string;
  goalTitle: string;
  tasks: TaskDTO[];
}

const statusOrder: Record<string, number> = { pending: 0, done: 1, skipped: 2 };

interface OptimisticAction {
  taskId: string;
  status: TaskDTO["status"];
  resultNote?: string;
}

export function applyOptimisticAction(
  sections: TodaySection[],
  action: OptimisticAction
): TodaySection[] {
  return sections.map((section) => ({
    ...section,
    tasks: section.tasks
      .map((t) =>
        t.id === action.taskId
          ? {
              ...t,
              status: action.status,
              resultNote:
                action.status === "pending"
                  ? null
                  : (action.resultNote ?? t.resultNote),
            }
          : t
      )
      .sort((a, b) => (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9)),
  }));
}

function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

export default function TodayClient({ sections }: { sections: TodaySection[] }) {
  const router = useRouter();
  const [optimisticSections, applyOptimistic] = useOptimistic(
    sections,
    applyOptimisticAction
  );
  const [editing, setEditing] = useState<{
    taskId: string;
    mode: "done" | "skipped";
  } | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [feedbackLoading, setFeedbackLoading] = useState<Record<string, boolean>>({});

  function patchTask(taskId: string, status: TaskDTO["status"], resultNote?: string) {
    setError("");
    setEditing(null);
    setNote("");
    startTransition(async () => {
      applyOptimistic({ taskId, status, resultNote });
      try {
        const res = await fetch(`/api/companion/tasks/${taskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status, resultNote }),
        });
        const result = (await res.json()) as { code: number; msg: string };
        if (result.code !== 0) {
          throw new Error(result.msg || "打卡失败");
        }
        router.refresh();
      } catch (err) {
        // 乐观状态随 transition 结束自动回滚，这里只需提示
        setError(
          `${err instanceof Error ? err.message : String(err)}，操作未生效，请重试`
        );
      }
    });
  }

  async function generateFeedback(goalId: string) {
    setError("");
    setFeedbackLoading((prev) => ({ ...prev, [goalId]: true }));
    try {
      const res = await fetch("/api/companion/daily-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goalId }),
      });
      const result = (await res.json()) as {
        code: number;
        data: { feedback: string } | null;
        msg: string;
      };
      if (result.code !== 0 || !result.data) {
        throw new Error(result.msg || "生成总结失败");
      }
      setFeedback((prev) => ({ ...prev, [goalId]: result.data!.feedback }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setFeedbackLoading((prev) => ({ ...prev, [goalId]: false }));
    }
  }

  const inputClass =
    "w-full rounded-xl border border-zinc-200 bg-white p-3 text-base text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50";

  return (
    <div className="space-y-8">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}

      {optimisticSections.map((section) => {
        const doneCount = section.tasks.filter((t) => t.status === "done").length;
        return (
          <section key={section.goalId}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                {section.goalTitle}
              </h2>
              <span className="text-sm text-zinc-500 dark:text-zinc-400">
                {doneCount}/{section.tasks.length} 已完成
              </span>
            </div>

            <div className="space-y-3">
              {section.tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  editingMode={
                    editing?.taskId === task.id ? editing.mode : null
                  }
                  note={editing?.taskId === task.id ? note : ""}
                  inputClass={inputClass}
                  onStartEdit={(mode) => {
                    setEditing({ taskId: task.id, mode });
                    setNote("");
                  }}
                  onNoteChange={setNote}
                  onConfirm={() => {
                    if (editing) {
                      patchTask(task.id, editing.mode, note);
                    }
                  }}
                  onCancel={() => {
                    setEditing(null);
                    setNote("");
                  }}
                  onUndo={() => patchTask(task.id, "pending")}
                />
              ))}
            </div>

            <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              {feedback[section.goalId] ? (
                <div className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                  <p className="mb-1 text-xs font-medium text-indigo-600 dark:text-indigo-400">
                    AI 今日总结
                  </p>
                  {feedback[section.goalId]}
                </div>
              ) : (
                <>
                  <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">
                    今日任务处理完后，让 AI 结合你的备考状态说两句
                  </p>
                  <button
                    onClick={() => generateFeedback(section.goalId)}
                    disabled={feedbackLoading[section.goalId]}
                    className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-base font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {feedbackLoading[section.goalId] && <Spinner />}
                    {feedbackLoading[section.goalId] ? "AI 思考中..." : "生成今日总结"}
                  </button>
                </>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function TaskCard({
  task,
  editingMode,
  note,
  inputClass,
  onStartEdit,
  onNoteChange,
  onConfirm,
  onCancel,
  onUndo,
}: {
  task: TaskDTO;
  editingMode: "done" | "skipped" | null;
  note: string;
  inputClass: string;
  onStartEdit: (mode: "done" | "skipped") => void;
  onNoteChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  onUndo: () => void;
}) {
  const isDone = task.status === "done";
  const isSkipped = task.status === "skipped";

  return (
    <div
      className={`rounded-2xl border p-4 transition ${
        isDone
          ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/40 dark:bg-emerald-900/10"
          : isSkipped
            ? "border-zinc-200 bg-zinc-100/60 opacity-75 dark:border-zinc-800 dark:bg-zinc-900/50"
            : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
      }`}
    >
      <div className="flex items-start gap-3">
        <button
          onClick={() => (isDone ? onUndo() : onStartEdit("done"))}
          aria-label={isDone ? "撤销完成" : "标记完成"}
          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold transition ${
            isDone
              ? "border-emerald-500 bg-emerald-500 text-white"
              : "border-zinc-300 text-transparent hover:border-emerald-400 dark:border-zinc-600"
          }`}
        >
          ✓
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p
              className={`font-medium ${
                isSkipped
                  ? "text-zinc-400 line-through dark:text-zinc-500"
                  : "text-zinc-900 dark:text-zinc-50"
              }`}
            >
              {task.title}
            </p>
            <span className="shrink-0 text-xs text-zinc-400 dark:text-zinc-500">
              约 {task.estMinutes} 分钟
            </span>
          </div>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">{task.detail}</p>
          {(isDone || isSkipped) && task.resultNote && (
            <p className="mt-1.5 rounded-lg bg-white/70 px-2 py-1 text-xs text-zinc-600 dark:bg-zinc-900/60 dark:text-zinc-400">
              {isDone ? "结果：" : "原因："}
              {task.resultNote}
            </p>
          )}
        </div>
      </div>

      {editingMode ? (
        <div className="mt-3 space-y-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
          <textarea
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
            rows={2}
            placeholder={
              editingMode === "done"
                ? "结果备注（可选）：如 听力20题对了12个"
                : "跳过原因（可选）：如 今天有实验报告"
            }
            className={inputClass}
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={onCancel}
              className="min-h-[44px] rounded-xl px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              取消
            </button>
            {editingMode === "skipped" && (
              <button
                onClick={() => onConfirm()}
                className="min-h-[44px] rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:border-zinc-300 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300"
              >
                确认跳过
              </button>
            )}
            <button
              onClick={onConfirm}
              className={`min-h-[44px] rounded-xl px-4 py-2 text-sm font-medium text-white transition disabled:opacity-50 ${
                editingMode === "done"
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : "bg-zinc-500 hover:bg-zinc-600"
              }`}
            >
              {editingMode === "done" ? "确认完成" : "确认跳过"}
            </button>
          </div>
        </div>
      ) : (
        task.status === "pending" && (
          <div className="mt-3 flex gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
            <button
              onClick={() => onStartEdit("done")}
              className="min-h-[44px] flex-1 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
            >
              完成打卡
            </button>
            <button
              onClick={() => onStartEdit("skipped")}
              className="min-h-[44px] rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 transition hover:border-zinc-300 dark:border-zinc-700 dark:text-zinc-300"
            >
              跳过
            </button>
          </div>
        )
      )}

      {(isDone || isSkipped) && !editingMode && (
        <div className="mt-3 flex justify-end border-t border-zinc-100 pt-2 dark:border-zinc-800">
          <button
            onClick={onUndo}
            className="min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            撤销
          </button>
        </div>
      )}
    </div>
  );
}
