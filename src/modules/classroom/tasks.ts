import type { ClassTaskType, ClassTaskSourceType } from "@/generated/prisma/client";

export const CLASS_TASK_TYPE_LABELS: Record<ClassTaskType, string> = {
  homework: "作业",
  exam: "考试",
  activity: "活动",
  notice: "通知",
};

const TYPE_BY_LABEL = new Map<string, ClassTaskType>(
  Object.entries(CLASS_TASK_TYPE_LABELS).flatMap(([key, label]) => [
    [label, key as ClassTaskType],
    [key, key as ClassTaskType],
  ])
);

export const PLATFORM_OPTIONS = ["学习通", "雨课堂", "邮箱", "线下", "其他"];

/** 归一化 'YYYY-MM-DD HH:mm[:ss]' / ISO 'T' 分隔的时间为 'YYYY-MM-DD HH:mm'，非法返回 null */
export function normalizeDeadlineText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const match = trimmed.match(
    /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::\d{2})?$/
  );
  return match ? `${match[1]} ${match[2]}` : null;
}

/** 'YYYY-MM-DD HH:mm' → 本地时区 Date，非法抛错 */
export function parseDeadlineText(value: unknown): Date {
  const normalized = normalizeDeadlineText(value);
  if (!normalized) {
    throw new Error("截止时间格式应为 YYYY-MM-DD HH:mm");
  }
  const [datePart, timePart] = normalized.split(" ");
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm] = timePart.split(":").map(Number);
  const date = new Date(y, m - 1, d, hh, mm);
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== m - 1 ||
    date.getDate() !== d
  ) {
    throw new Error("截止时间不是有效日期");
  }
  return date;
}

export function parseClassTaskType(value: unknown): ClassTaskType {
  const type = TYPE_BY_LABEL.get(String(value ?? "").trim());
  if (!type) {
    throw new Error(`任务类型无效，应为 ${Object.values(CLASS_TASK_TYPE_LABELS).join("/")}`);
  }
  return type;
}

export function parseClassTaskSourceType(value: unknown): ClassTaskSourceType {
  if (value === "screenshot") return "screenshot";
  return "text";
}

export interface ClassTaskInput {
  title: string;
  detail: string;
  deadline: Date;
  platform: string;
  course: string | null;
  type: ClassTaskType;
  sourceType: ClassTaskSourceType;
}

/** 校验并归一化单条任务入参（提取预览与发布入库共用），不合格抛错。 */
export function parseTaskInput(raw: unknown, index: number): ClassTaskInput {
  const label = `第 ${index + 1} 条任务`;
  if (typeof raw !== "object" || raw === null) {
    throw new Error(`${label}格式错误`);
  }
  const obj = raw as Record<string, unknown>;

  const title = typeof obj.title === "string" ? obj.title.trim() : "";
  if (!title) throw new Error(`${label}标题不能为空`);
  const detail = typeof obj.detail === "string" ? obj.detail.trim() : "";
  if (!detail) throw new Error(`${label}具体要求不能为空`);
  const platform = typeof obj.platform === "string" ? obj.platform.trim() : "";
  if (!platform) throw new Error(`${label}提交平台不能为空`);
  const course =
    typeof obj.course === "string" && obj.course.trim() ? obj.course.trim() : null;

  return {
    title,
    detail,
    deadline: parseDeadlineText(obj.deadline),
    platform,
    course,
    type: parseClassTaskType(obj.type),
    sourceType: parseClassTaskSourceType(obj.sourceType),
  };
}

export interface ExtractedTask {
  title: string;
  detail: string;
  /** 'YYYY-MM-DD HH:mm'，预览阶段保持字符串，发布时再解析 */
  deadline: string;
  platform: string;
  course: string | null;
  type: string;
  confidence: number;
}

/** 校验 AI 提取结果结构，不合格抛错。 */
export function parseExtractedTasks(raw: unknown): ExtractedTask[] {
  if (typeof raw !== "object" || raw === null || !("tasks" in raw)) {
    throw new Error("AI 返回格式错误，缺少 tasks 字段");
  }
  const tasks = (raw as { tasks: unknown }).tasks;
  if (!Array.isArray(tasks)) {
    throw new Error("AI 返回的 tasks 不是数组");
  }
  return tasks.map((t, i) => {
    if (typeof t !== "object" || t === null) {
      throw new Error(`第 ${i + 1} 条提取结果格式错误`);
    }
    const obj = t as Record<string, unknown>;
    const title = typeof obj.title === "string" ? obj.title.trim() : "";
    const detail = typeof obj.detail === "string" ? obj.detail.trim() : "";
    const deadline = normalizeDeadlineText(obj.deadline) ?? "";
    const platform = typeof obj.platform === "string" ? obj.platform.trim() : "";
    if (!title || !deadline || !platform) {
      throw new Error(`第 ${i + 1} 条提取结果字段不完整`);
    }
    const confidence =
      typeof obj.confidence === "number" && obj.confidence >= 0 && obj.confidence <= 1
        ? obj.confidence
        : 0.5;
    return {
      title,
      detail,
      deadline,
      platform,
      course:
        typeof obj.course === "string" && obj.course.trim() ? obj.course.trim() : null,
      type: typeof obj.type === "string" ? obj.type.trim() : "通知",
      confidence,
    };
  });
}
