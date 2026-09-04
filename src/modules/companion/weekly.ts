import type { GeneratedTask } from "./plan";

export type RiskLevel = "low" | "medium" | "high";

export interface WeeklyReviewResult {
  riskLevel: RiskLevel;
  summary: string;
  adjustments: string;
  nextWeekTasks: GeneratedTask[];
}

const RISK_LEVELS: RiskLevel[] = ["low", "medium", "high"];

/** 校验并归一化周报 AI 输出，不合格直接抛错。 */
export function parseWeeklyReview(raw: unknown): WeeklyReviewResult {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("周报格式错误");
  }
  const obj = raw as Record<string, unknown>;

  const riskLevel = obj.riskLevel;
  if (typeof riskLevel !== "string" || !RISK_LEVELS.includes(riskLevel as RiskLevel)) {
    throw new Error("风险等级无效，应为 low/medium/high");
  }

  if (typeof obj.summary !== "string" || !obj.summary.trim()) {
    throw new Error("周报总结不能为空");
  }
  const adjustments = typeof obj.adjustments === "string" ? obj.adjustments.trim() : "";

  if (!Array.isArray(obj.nextWeekTasks) || obj.nextWeekTasks.length === 0) {
    throw new Error("下周任务不能为空");
  }

  const nextWeekTasks: GeneratedTask[] = obj.nextWeekTasks.map((t, i) => {
    if (typeof t !== "object" || t === null) {
      throw new Error(`下周第 ${i + 1} 条任务格式错误`);
    }
    const task = t as Record<string, unknown>;
    const day = typeof task.day === "number" ? task.day : Number(task.day);
    if (!Number.isInteger(day) || day < 1 || day > 7) {
      throw new Error(`下周第 ${i + 1} 条任务 day 应为 1-7`);
    }
    if (typeof task.title !== "string" || !task.title.trim()) {
      throw new Error(`下周第 ${i + 1} 条任务标题不能为空`);
    }
    if (typeof task.detail !== "string" || !task.detail.trim()) {
      throw new Error(`下周第 ${i + 1} 条任务详情不能为空`);
    }
    const minutes = typeof task.minutes === "number" ? task.minutes : Number(task.minutes);
    if (!Number.isInteger(minutes) || minutes <= 0) {
      throw new Error(`下周第 ${i + 1} 条任务预计分钟必须为正整数`);
    }
    return { day, title: task.title.trim(), detail: task.detail.trim(), minutes };
  });

  return {
    riskLevel: riskLevel as RiskLevel,
    summary: obj.summary.trim(),
    adjustments,
    nextWeekTasks,
  };
}
