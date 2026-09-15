/**
 * 目标详情页的展示数据组装（纯函数，可单测）。
 * 页面层只负责查库，所有展示形态（标签、进度、时间线状态、风险等级）在这里计算。
 */
import { daysUntil, toISODate } from "./plan";

export const GOAL_CATEGORY_LABELS: Record<string, string> = {
  exam: "考试",
  project: "项目",
  habit: "习惯",
};

export type RiskLevel = "low" | "medium" | "high";

export const RISK_LEVEL_STYLES: Record<
  RiskLevel,
  { dot: string; label: string; text: string }
> = {
  low: {
    dot: "bg-emerald-500",
    label: "状态良好",
    text: "text-emerald-700 dark:text-emerald-300",
  },
  medium: {
    dot: "bg-amber-500",
    label: "需要关注",
    text: "text-amber-700 dark:text-amber-300",
  },
  high: {
    dot: "bg-red-500",
    label: "进度风险高",
    text: "text-red-700 dark:text-red-300",
  },
};

export type GoalStatusValue = "active" | "done" | "archived";
export type PhaseTiming = "past" | "current" | "upcoming";

export interface GoalDetailGoalInput {
  id: string;
  title: string;
  category: string;
  deadline: Date;
  dailyMinutes: number;
  userContext: string;
  status: GoalStatusValue;
  metadata: unknown;
  createdAt: Date;
}

export interface GoalDetailPhaseInput {
  id: string;
  name: string;
  focus: string;
  order: number;
  startDate: Date;
  endDate: Date;
  metadata: unknown;
}

export interface GoalDetailTaskStatInput {
  phaseId: string | null;
  status: string;
}

export interface GoalDetailReportInput {
  id: string;
  weekStart: Date;
  completionRate: number;
  aiSummary: string;
  adjustments: string;
  metadata: unknown;
  createdAt: Date;
}

export interface PhaseRow {
  id: string;
  order: number;
  name: string;
  focus: string;
  startLabel: string;
  endLabel: string;
  exitCriteria: string;
  timing: PhaseTiming;
  isCurrent: boolean;
  total: number;
  done: number;
  percent: number;
}

export interface ReportRow {
  id: string;
  weekLabel: string;
  riskLevel: RiskLevel;
  completionRate: number;
  summary: string;
  adjustments: string;
}

export interface GoalDetail {
  id: string;
  title: string;
  categoryLabel: string;
  status: GoalStatusValue;
  deadlineLabel: string;
  daysLeft: number;
  dailyMinutes: number;
  userContext: string;
  assessment: string;
  createdAtLabel: string;
  totalTasks: number;
  doneTasks: number;
  overallPercent: number;
  phases: PhaseRow[];
  reports: ReportRow[];
}

/** metadata Json 中取非空字符串字段，取不到返回 ""。 */
function metadataString(metadata: unknown, key: string): string {
  if (typeof metadata === "object" && metadata !== null && key in metadata) {
    const value = (metadata as Record<string, unknown>)[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

/** 周报 metadata.riskLevel 容错：缺省或非法一律按 low。 */
export function normalizeRiskLevel(value: unknown): RiskLevel {
  return value === "medium" || value === "high" ? value : "low";
}

export function buildPhaseRows(
  phases: GoalDetailPhaseInput[],
  taskStats: GoalDetailTaskStatInput[],
  today: Date
): PhaseRow[] {
  return [...phases]
    .sort((a, b) => a.order - b.order)
    .map((phase) => {
      const related = taskStats.filter((t) => t.phaseId === phase.id);
      const done = related.filter((t) => t.status === "done").length;
      const isCurrent = phase.startDate <= today && phase.endDate >= today;
      return {
        id: phase.id,
        order: phase.order,
        name: phase.name,
        focus: phase.focus,
        startLabel: toISODate(phase.startDate).slice(5).replace("-", "/"),
        endLabel: toISODate(phase.endDate).slice(5).replace("-", "/"),
        exitCriteria: metadataString(phase.metadata, "exitCriteria"),
        timing: isCurrent ? "current" : phase.endDate < today ? "past" : "upcoming",
        isCurrent,
        total: related.length,
        done,
        percent: related.length === 0 ? 0 : Math.round((done / related.length) * 100),
      };
    });
}

export function buildReportRows(reports: GoalDetailReportInput[]): ReportRow[] {
  return [...reports]
    .sort(
      (a, b) =>
        b.weekStart.getTime() - a.weekStart.getTime() ||
        b.createdAt.getTime() - a.createdAt.getTime()
    )
    .map((report) => ({
      id: report.id,
      weekLabel: `${toISODate(report.weekStart).slice(5).replace("-", "/")} 当周`,
      riskLevel: normalizeRiskLevel(
        typeof report.metadata === "object" && report.metadata !== null
          ? (report.metadata as Record<string, unknown>).riskLevel
          : null
      ),
      completionRate: Math.round(report.completionRate),
      summary: report.aiSummary,
      adjustments: report.adjustments,
    }));
}

export function buildGoalDetail(
  goal: GoalDetailGoalInput,
  phases: GoalDetailPhaseInput[],
  taskStats: GoalDetailTaskStatInput[],
  reports: GoalDetailReportInput[],
  today: Date
): GoalDetail {
  const doneTasks = taskStats.filter((t) => t.status === "done").length;
  return {
    id: goal.id,
    title: goal.title,
    categoryLabel: GOAL_CATEGORY_LABELS[goal.category] ?? goal.category,
    status: goal.status,
    deadlineLabel: toISODate(goal.deadline),
    daysLeft: Math.max(0, daysUntil(goal.deadline, today)),
    dailyMinutes: goal.dailyMinutes,
    userContext: goal.userContext,
    assessment: metadataString(goal.metadata, "assessment"),
    createdAtLabel: toISODate(goal.createdAt),
    totalTasks: taskStats.length,
    doneTasks,
    overallPercent:
      taskStats.length === 0 ? 0 : Math.round((doneTasks / taskStats.length) * 100),
    phases: buildPhaseRows(phases, taskStats, today),
    reports: buildReportRows(reports),
  };
}
