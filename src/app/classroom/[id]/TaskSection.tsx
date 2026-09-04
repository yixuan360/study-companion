"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CLASS_TASK_TYPE_LABELS,
  PLATFORM_OPTIONS,
  type ExtractedTask,
} from "@/modules/classroom/tasks";

export interface TaskItem {
  id: string;
  title: string;
  detail: string;
  platform: string;
  course: string | null;
  type: "homework" | "exam" | "activity" | "notice";
  deadlineISO: string;
  createdByName: string;
  updatedByName: string | null;
  myDone: boolean;
}

interface DraftTask {
  key: string;
  title: string;
  detail: string;
  /** datetime-local 格式 YYYY-MM-DDTHH:mm */
  deadlineLocal: string;
  platform: string;
  course: string;
  type: string;
  confidence: number;
}

const TYPE_OPTIONS = Object.entries(CLASS_TASK_TYPE_LABELS);
const MIN_CONFIDENCE = 0.6;
const MIN_CLIPBOARD_LENGTH = 15;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function formatDeadline(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日 周${"日一二三四五六"[d.getDay()]} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function remainingLabel(dueMs: number, nowMs: number): string {
  const diff = dueMs - nowMs;
  if (diff <= 0) {
    const overdueDays = Math.floor(-diff / 86_400_000);
    const overdueHours = Math.floor(-diff / 3_600_000);
    return overdueDays >= 1 ? `已逾期 ${overdueDays} 天` : `已逾期 ${Math.max(1, overdueHours)} 小时`;
  }
  const hours = diff / 3_600_000;
  if (hours < 1) return "不到 1 小时截止";
  if (hours < 24) return `还剩 ${Math.ceil(hours)} 小时`;
  return `还剩 ${Math.ceil(hours / 24)} 天`;
}

function urgency(diffMs: number): "overdue" | "red" | "yellow" | "green" {
  if (diffMs <= 0) return "overdue";
  if (diffMs < 24 * 3_600_000) return "red";
  if (diffMs < 3 * 86_400_000) return "yellow";
  return "green";
}

const urgencyDot: Record<string, string> = {
  overdue: "bg-red-500",
  red: "bg-red-500",
  yellow: "bg-amber-500",
  green: "bg-emerald-500",
};

const typeTag: Record<string, string> = {
  homework: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
  exam: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  activity: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  notice: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
};

const inputClass =
  "w-full rounded-lg border border-zinc-200 bg-white p-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50";

function toDraft(task: ExtractedTask, index: number): DraftTask {
  return {
    key: `${Date.now()}-${index}`,
    title: task.title,
    detail: task.detail,
    deadlineLocal: task.deadline.replace(" ", "T"),
    platform: task.platform,
    course: task.course ?? "",
    type: task.type,
    confidence: task.confidence,
  };
}

export function TaskSection({
  classroomId,
  tasks,
}: {
  classroomId: string;
  tasks: TaskItem[];
  /** 预留：录入人与当前用户相同时可显示"我录入的"角标 */
  currentUserName: string;
}) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [drafts, setDrafts] = useState<DraftTask[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [inputOpen, setInputOpen] = useState(false);
  const [clipboardSuggestion, setClipboardSuggestion] = useState<string | null>(null);
  const [clipboardPrompted, setClipboardPrompted] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "done">("all");
  const [now] = useState(() => Date.now());

  function updateDraft(key: string, field: keyof DraftTask, value: string | number) {
    setDrafts((prev) =>
      prev.map((d) => (d.key === key ? { ...d, [field]: value } : d))
    );
  }

  function removeDraft(key: string) {
    setDrafts((prev) => prev.filter((d) => d.key !== key));
  }

  async function extract(text?: string) {
    const target = (text ?? content).trim();
    if (!target) return;
    setError("");
    setNotice("");
    setExtracting(true);
    try {
      const res = await fetch(`/api/classroom/${classroomId}/tasks/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: target }),
      });
      const result = (await res.json()) as {
        code: number;
        data: { tasks: ExtractedTask[]; truncated: boolean } | null;
        msg: string;
      };
      if (result.code !== 0 || !result.data) {
        throw new Error(result.msg || "提取失败");
      }
      if (result.data.tasks.length === 0) {
        setNotice("没有从这段文字里识别出任务，可以换个说法或手动补充");
        setDrafts([]);
      } else {
        setDrafts(result.data.tasks.map(toDraft));
      }
      if (result.data.truncated) {
        setNotice("通知较长，仅提取前 5000 字");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExtracting(false);
    }
  }

  async function publish() {
    if (drafts.length === 0) return;
    setError("");
    setPublishing(true);
    try {
      const res = await fetch(`/api/classroom/${classroomId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tasks: drafts.map((d) => ({
            title: d.title,
            detail: d.detail,
            deadline: d.deadlineLocal.replace("T", " "),
            platform: d.platform,
            course: d.course || null,
            type: d.type,
            sourceType: "text",
          })),
        }),
      });
      const result = (await res.json()) as { code: number; msg: string };
      if (result.code !== 0) {
        throw new Error(result.msg || "发布失败");
      }
      setDrafts([]);
      setContent("");
      setInputOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPublishing(false);
    }
  }

  async function toggleTask(taskId: string) {
    setError("");
    try {
      const res = await fetch(`/api/classroom/${classroomId}/tasks/${taskId}/toggle`, {
        method: "POST",
      });
      const result = (await res.json()) as { code: number; msg: string };
      if (result.code !== 0) {
        throw new Error(result.msg || "操作失败");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function tryReadClipboard() {
    if (content.trim() || !navigator.clipboard?.readText) return;
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.length >= MIN_CLIPBOARD_LENGTH && clipboardPrompted !== text) {
        setClipboardPrompted(text);
        setClipboardSuggestion(text);
      }
    } catch {
      // 无授权/无剪贴板内容时静默跳过
    }
  }

  const filtered = tasks
    .filter((t) =>
      filter === "all" ? true : filter === "done" ? t.myDone : !t.myDone
    )
    .sort((a, b) => {
      const aOverdue = !a.myDone && new Date(a.deadlineISO).getTime() <= now ? 0 : 1;
      const bOverdue = !b.myDone && new Date(b.deadlineISO).getTime() <= now ? 0 : 1;
      if (aOverdue !== bOverdue) return aOverdue - bOverdue;
      return new Date(a.deadlineISO).getTime() - new Date(b.deadlineISO).getTime();
    });

  const pendingCount = tasks.filter((t) => !t.myDone).length;

  const panel = (
    <ExtractPanel
      content={content}
      drafts={drafts}
      extracting={extracting}
      publishing={publishing}
      notice={notice}
      clipboardSuggestion={clipboardSuggestion}
      onContentChange={(v) => {
        setContent(v);
        setClipboardSuggestion(null);
      }}
      onFocusTextarea={tryReadClipboard}
      onAcceptClipboard={() => {
        if (clipboardSuggestion) {
          setContent(clipboardSuggestion);
          extract(clipboardSuggestion);
        }
        setClipboardSuggestion(null);
      }}
      onDismissClipboard={() => setClipboardSuggestion(null)}
      onExtract={() => extract()}
      onUpdateDraft={updateDraft}
      onRemoveDraft={removeDraft}
      onPublish={publish}
      onCloseMobile={() => setInputOpen(false)}
    />
  );

  return (
    <>
      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}

      <section className="mb-8 hidden sm:block">
        <h2 className="mb-2 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          录入任务
        </h2>
        {panel}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            任务清单（{tasks.length}）
          </h2>
          <div className="flex rounded-xl border border-zinc-200 bg-white p-1 text-sm dark:border-zinc-800 dark:bg-zinc-900">
            {(
              [
                ["all", `全部`],
                ["pending", `未完成 ${pendingCount}`],
                ["done", "已完成"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className={`min-h-[32px] rounded-lg px-3 font-medium transition ${
                  filter === value
                    ? "bg-indigo-600 text-white"
                    : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
            {tasks.length === 0
              ? "还没有任务，粘贴班级群通知试试智能提取"
              : "这个筛选下没有任务"}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((task) => {
              const dueMs = new Date(task.deadlineISO).getTime();
              const diff = dueMs - now;
              const isOverdue = diff <= 0 && !task.myDone;
              const level = task.myDone ? "green" : urgency(diff);
              return (
                <div
                  key={task.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => router.push(`/classroom/${classroomId}/tasks/${task.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      router.push(`/classroom/${classroomId}/tasks/${task.id}`);
                    }
                  }}
                  className={`cursor-pointer rounded-2xl border p-4 transition hover:shadow-md ${
                    isOverdue
                      ? "border-red-200 bg-red-50/50 dark:border-red-900/40 dark:bg-red-900/10"
                      : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleTask(task.id);
                      }}
                      aria-label={task.myDone ? "标记未完成" : "标记完成"}
                      className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold transition ${
                        task.myDone
                          ? "border-emerald-500 bg-emerald-500 text-white"
                          : "border-zinc-300 text-transparent hover:border-emerald-400 dark:border-zinc-600"
                      }`}
                    >
                      ✓
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-1.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${typeTag[task.type] ?? typeTag.notice}`}
                        >
                          {CLASS_TASK_TYPE_LABELS[task.type] ?? task.type}
                        </span>
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                          {task.platform}
                        </span>
                        {task.course && (
                          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">
                            {task.course}
                          </span>
                        )}
                        {isOverdue && (
                          <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-semibold text-white">
                            已逾期
                          </span>
                        )}
                      </div>
                      <p
                        className={`font-medium ${
                          task.myDone
                            ? "text-zinc-400 line-through dark:text-zinc-500"
                            : "text-zinc-900 dark:text-zinc-50"
                        }`}
                      >
                        {task.title}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-sm text-zinc-500 dark:text-zinc-400">
                        {task.detail}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        <span className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300">
                          <span className={`h-2 w-2 rounded-full ${urgencyDot[level]}`} />
                          {formatDeadline(task.deadlineISO)}
                        </span>
                        <span className={isOverdue ? "font-medium text-red-600 dark:text-red-400" : "text-zinc-500 dark:text-zinc-400"}>
                          {task.myDone && diff <= 0 ? "已完成" : remainingLabel(dueMs, now)}
                        </span>
                        <span className="text-zinc-400 dark:text-zinc-500">
                          {task.createdByName} 录入
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 移动端固定底部录入按钮（录入区平时隐藏，点此弹出底部弹层） */}
      {!inputOpen && (
        <button
          onClick={() => setInputOpen(true)}
          className="fixed inset-x-4 bottom-4 z-30 flex min-h-[48px] items-center justify-center rounded-2xl bg-indigo-600 px-5 text-base font-medium text-white shadow-lg transition hover:bg-indigo-700 sm:hidden"
        >
          + 录入任务
        </button>
      )}

      {inputOpen && (
        <div className="fixed inset-0 z-40 sm:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setInputOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[88svh] overflow-y-auto rounded-t-2xl bg-zinc-50 p-4 pb-8 dark:bg-zinc-950">
            <div className="mx-auto max-w-2xl">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                  录入任务
                </h2>
                <button
                  onClick={() => setInputOpen(false)}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                >
                  收起
                </button>
              </div>
              {panel}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ExtractPanel({
  content,
  drafts,
  extracting,
  publishing,
  notice,
  clipboardSuggestion,
  onContentChange,
  onFocusTextarea,
  onAcceptClipboard,
  onDismissClipboard,
  onExtract,
  onUpdateDraft,
  onRemoveDraft,
  onPublish,
  onCloseMobile,
}: {
  content: string;
  drafts: DraftTask[];
  extracting: boolean;
  publishing: boolean;
  notice: string;
  clipboardSuggestion: string | null;
  onContentChange: (v: string) => void;
  onFocusTextarea: () => void;
  onAcceptClipboard: () => void;
  onDismissClipboard: () => void;
  onExtract: () => void;
  onUpdateDraft: (key: string, field: keyof DraftTask, value: string | number) => void;
  onRemoveDraft: (key: string) => void;
  onPublish: () => void;
  onCloseMobile: () => void;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      {clipboardSuggestion && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200">
          <span className="min-w-0 flex-1 truncate">检测到剪贴板文字，是否提取？</span>
          <div className="flex shrink-0 gap-2">
            <button
              onClick={onDismissClipboard}
              className="min-h-[36px] rounded-lg px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900/40"
            >
              忽略
            </button>
            <button
              onClick={onAcceptClipboard}
              className="min-h-[36px] rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700"
            >
              提取
            </button>
          </div>
        </div>
      )}

      <textarea
        value={content}
        onChange={(e) => onContentChange(e.target.value)}
        onFocus={onFocusTextarea}
        rows={5}
        placeholder="粘贴班级群通知原文，AI 自动提取任务、截止时间和平台..."
        className={inputClass}
      />
      {notice && (
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">{notice}</p>
      )}

      {drafts.length === 0 ? (
        <button
          onClick={onExtract}
          disabled={extracting || !content.trim()}
          className="mt-3 flex min-h-[44px] w-full items-center justify-center rounded-xl bg-indigo-600 px-5 py-2.5 text-base font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {extracting ? (
            <>
              <Spinner /> AI 提取中...
            </>
          ) : (
            "智能提取"
          )}
        </button>
      ) : (
        <>
          <div className="mt-4 space-y-3">
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              提取到 {drafts.length} 项任务，请确认后发布
            </p>
            {drafts.map((draft) => {
              const lowConfidence =
                draft.confidence < MIN_CONFIDENCE ||
                draft.detail.includes("时间待确认");
              return (
                <div
                  key={draft.key}
                  className={`rounded-xl border p-3 ${
                    lowConfidence
                      ? "border-amber-300 bg-amber-50/70 dark:border-amber-900/50 dark:bg-amber-900/10"
                      : "border-zinc-200 bg-zinc-50/60 dark:border-zinc-800 dark:bg-zinc-900/50"
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    {lowConfidence ? (
                      <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                        ⚠ 时间待确认（置信度 {draft.confidence.toFixed(2)}）
                      </span>
                    ) : (
                      <span className="text-xs text-zinc-400 dark:text-zinc-500">
                        置信度 {draft.confidence.toFixed(2)}
                      </span>
                    )}
                    <button
                      onClick={() => onRemoveDraft(draft.key)}
                      className="rounded-lg px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                    >
                      删除
                    </button>
                  </div>
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={draft.title}
                      onChange={(e) => onUpdateDraft(draft.key, "title", e.target.value)}
                      placeholder="任务标题"
                      className={inputClass}
                    />
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <input
                        type="datetime-local"
                        value={draft.deadlineLocal}
                        onChange={(e) =>
                          onUpdateDraft(draft.key, "deadlineLocal", e.target.value)
                        }
                        className={inputClass}
                      />
                      <select
                        value={draft.platform}
                        onChange={(e) => onUpdateDraft(draft.key, "platform", e.target.value)}
                        className={inputClass}
                      >
                        {PLATFORM_OPTIONS.includes(draft.platform) ? null : (
                          <option value={draft.platform}>{draft.platform}</option>
                        )}
                        {PLATFORM_OPTIONS.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                      <select
                        value={
                          TYPE_OPTIONS.some(([key]) => key === draft.type)
                            ? draft.type
                            : "notice"
                        }
                        onChange={(e) => onUpdateDraft(draft.key, "type", e.target.value)}
                        className={inputClass}
                      >
                        {TYPE_OPTIONS.map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <input
                      type="text"
                      value={draft.course}
                      onChange={(e) => onUpdateDraft(draft.key, "course", e.target.value)}
                      placeholder="课程名（选填）"
                      className={inputClass}
                    />
                    <textarea
                      value={draft.detail}
                      onChange={(e) => onUpdateDraft(draft.key, "detail", e.target.value)}
                      rows={2}
                      placeholder="具体要求"
                      className={inputClass}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => {
                onExtract();
                onCloseMobile();
              }}
              disabled={extracting || !content.trim()}
              className="min-h-[44px] rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-600 transition hover:border-zinc-300 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300"
            >
              重新提取
            </button>
            <button
              onClick={onPublish}
              disabled={publishing}
              className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-emerald-600 px-5 py-2.5 text-base font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {publishing ? (
                <>
                  <Spinner /> 发布中...
                </>
              ) : (
                `确认发布 ${drafts.length} 项任务`
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={`mr-1 animate-spin ${className}`}
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
