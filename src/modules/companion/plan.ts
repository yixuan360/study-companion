export interface GeneratedPhase {
  name: string;
  weeks: number;
  focus: string;
  exitCriteria: string;
}

export interface GeneratedTask {
  day: number;
  title: string;
  detail: string;
  minutes: number;
}

export interface GeneratedPlan {
  assessment: string;
  phases: GeneratedPhase[];
  week1Tasks: GeneratedTask[];
}

export const GOAL_CATEGORIES = ["exam", "project", "habit"] as const;
export type GoalCategoryValue = (typeof GOAL_CATEGORIES)[number];

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function startOfToday(): Date {
  return startOfDay(new Date());
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** 解析 'YYYY-MM-DD' 为本地时区当天零点，非法输入抛错。 */
export function parseDateOnly(value: unknown, label: string): Date {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label}格式应为 YYYY-MM-DD`);
  }
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== m - 1 ||
    date.getDate() !== d
  ) {
    throw new Error(`${label}不是有效日期`);
  }
  return date;
}

function asNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label}不能为空`);
  }
  return value.trim();
}

function asPositiveInt(value: unknown, label: string, max?: number): number {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isInteger(n) || n <= 0) {
    throw new Error(`${label}必须为正整数`);
  }
  if (max !== undefined && n > max) {
    throw new Error(`${label}不能超过 ${max}`);
  }
  return n;
}

/** assessment 可能是单段文字，也可能是模型输出的字符串数组（最多3条），统一拼接。 */
function asAssessment(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((s) => typeof s === "string" && s.trim())
  ) {
    return (value as string[]).map((s) => s.trim()).join("\n");
  }
  throw new Error("差距评估不能为空");
}

/** 校验并归一化 AI 生成的计划结构，不合格直接抛错。 */
export function parsePlan(raw: unknown): GeneratedPlan {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("计划格式错误");
  }
  const obj = raw as Record<string, unknown>;

  const assessment = asAssessment(obj.assessment);
  if (!Array.isArray(obj.phases) || obj.phases.length === 0) {
    throw new Error("计划缺少阶段划分");
  }
  if (!Array.isArray(obj.week1Tasks)) {
    throw new Error("计划缺少第一周任务");
  }

  const phases: GeneratedPhase[] = obj.phases.map((p, i) => {
    if (typeof p !== "object" || p === null) {
      throw new Error(`第 ${i + 1} 个阶段格式错误`);
    }
    const phase = p as Record<string, unknown>;
    return {
      name: asNonEmptyString(phase.name, `第 ${i + 1} 个阶段名称`),
      weeks: asPositiveInt(phase.weeks, `第 ${i + 1} 个阶段周数`),
      focus: asNonEmptyString(phase.focus, `第 ${i + 1} 个阶段重点`),
      exitCriteria: asNonEmptyString(phase.exitCriteria, `第 ${i + 1} 个阶段结束标志`),
    };
  });

  const week1Tasks: GeneratedTask[] = obj.week1Tasks.map((t, i) => {
    if (typeof t !== "object" || t === null) {
      throw new Error(`第 ${i + 1} 条任务格式错误`);
    }
    const task = t as Record<string, unknown>;
    return {
      day: asPositiveInt(task.day, `第 ${i + 1} 条任务天数`, 7),
      title: asNonEmptyString(task.title, `第 ${i + 1} 条任务标题`),
      detail: asNonEmptyString(task.detail, `第 ${i + 1} 条任务详情`),
      minutes: asPositiveInt(task.minutes, `第 ${i + 1} 条任务预计分钟`),
    };
  });

  return { assessment, phases, week1Tasks };
}

/** 计算各阶段的起止日期：第 i 个阶段从今天累计周数处开始。 */
export function computePhaseDates(
  phases: { weeks: number }[],
  today = startOfToday()
): { startDate: Date; endDate: Date }[] {
  let cursor = today;
  return phases.map((phase) => {
    const startDate = cursor;
    const endDate = addDays(addDays(startDate, phase.weeks * 7), -1);
    cursor = addDays(startDate, phase.weeks * 7);
    return { startDate, endDate };
  });
}

/** 第一周任务按 day 计算到期日：day 1 = 今天。 */
export function computeTaskDueDate(
  day: number,
  today = startOfToday()
): Date {
  return addDays(today, day - 1);
}
