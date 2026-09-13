import { prisma } from "@/lib/db";
import { chat } from "@/lib/ai";
import { startOfToday, type GeneratedTask } from "./plan";
import { assembleContext, MEMORY_PACK_HEADER } from "./memory";
import {
  daysUntil,
  getCheckInStreak,
  getWeekTasks,
  startOfWeek,
  toISODate,
  weekdayLabel,
} from "./stats";
import { parseWeeklyReview, type RiskLevel } from "./weekly";

export type WeeklyReportOutcome =
  | {
      status: "created";
      reportId: string;
      riskLevel: RiskLevel;
      summary: string;
      adjustments: string;
      completionRate: number;
      nextWeekTasks: GeneratedTask[];
    }
  | { status: "goal-not-found" }
  | { status: "already-exists" }
  | { status: "no-tasks" };

const statusLabels: Record<string, string> = {
  done: "已完成",
  skipped: "已跳过",
  pending: "未完成",
};

function buildPlannedTasksText(
  weekStart: Date,
  tasks: Awaited<ReturnType<typeof getWeekTasks>>
): string {
  return tasks
    .map((t) => {
      const date = toISODate(t.dueDate);
      return `- ${weekdayLabel(t.dueDate)}(${date.slice(5)})「${t.title}」预计 ${t.estMinutes} 分钟｜状态：${
        statusLabels[t.status] ?? t.status
      }`;
    })
    .join("\n");
}

function buildExecutionText(
  tasks: Awaited<ReturnType<typeof getWeekTasks>>,
  streak: number
): string {
  const done = tasks.filter((t) => t.status === "done");
  const skipped = tasks.filter((t) => t.status === "skipped");
  const missed = tasks.filter((t) => t.status === "pending");
  const rate = tasks.length ? Math.round((done.length / tasks.length) * 100) : 0;

  const lines: string[] = [`完成率：${done.length}/${tasks.length}（${rate}%）`];
  const streakText = streak > 0 ? `${streak} 天` : "尚未开始";
  lines.push(`连续打卡：${streakText}`);

  if (done.length > 0) {
    lines.push("已完成（含用户备注）：");
    for (const t of done) {
      lines.push(`- 「${t.title}」${t.resultNote ? `备注：${t.resultNote}` : "无备注"}`);
    }
  }
  if (skipped.length > 0) {
    lines.push("已跳过：");
    for (const t of skipped) {
      lines.push(`- 「${t.title}」${t.resultNote ? `原因：${t.resultNote}` : "未填原因"}`);
    }
  }
  if (missed.length > 0) {
    lines.push("落后未完成：");
    for (const t of missed) {
      lines.push(`- ${weekdayLabel(t.dueDate)}「${t.title}」`);
    }
  }
  return lines.join("\n");
}

/**
 * 为单个目标生成周报（AI 总结 + 下周任务建议）。
 * 下周任务只写进 WeeklyReport.metadata，是否入库由用户在周计划页确认。
 */
export async function generateWeeklyReport(goalId: string): Promise<WeeklyReportOutcome> {
  const goal = await prisma.goal.findUnique({ where: { id: goalId } });
  if (!goal) {
    return { status: "goal-not-found" };
  }

  const weekStart = startOfWeek(startOfToday());
  const existing = await prisma.weeklyReport.findFirst({
    where: { goalId, weekStart },
  });
  if (existing) {
    return { status: "already-exists" };
  }

  const weekTasks = await getWeekTasks(goalId, weekStart);
  if (weekTasks.length === 0) {
    return { status: "no-tasks" };
  }

  const [memory, streak] = await Promise.all([
    assembleContext(goalId),
    getCheckInStreak(goalId),
  ]);

  const daysLeft = Math.max(0, daysUntil(goal.deadline));
  const deadlineISO = toISODate(goal.deadline);
  const plannedTasksText = buildPlannedTasksText(weekStart, weekTasks);
  const executionText = buildExecutionText(weekTasks, streak);

  const result = await chat({
    messages: [
      { role: "system", content: `${MEMORY_PACK_HEADER}\n\n${memory}` },
      {
        role: "user",
        content: `目标：${goal.title}（剩余${daysLeft}天，截止${deadlineISO}）
原计划本周任务：
${plannedTasksText}

实际执行：
${executionText}

请输出严格 JSON：
{
  "riskLevel": "low|medium|high",
  "summary": "100字内周报：先肯定进步，再指出短板",
  "adjustments": "若为中高风险，给出调整方案（加量/砍项/延期）；低风险则给优化建议",
  "nextWeekTasks": [{"day":1,"title":"...","detail":"...","minutes":30}]
}
要求：
1. day 为 1-7，对应下周一到下周日
2. 任务必须具体可执行，任务量匹配每日可投入 ${goal.dailyMinutes} 分钟（同一天 minutes 总和不超过它）
3. 下周任务要考虑本周执行情况：落后的内容优先补，中高风险时适当减量`,
      },
    ],
    taskType: "complex",
    module: "备考周报",
    responseFormat: "json",
  });

  const review = parseWeeklyReview(JSON.parse(result.content));

  const report = await prisma.weeklyReport.create({
    data: {
      goalId,
      weekStart,
      completionRate: weekTasks.length
        ? (weekTasks.filter((t) => t.status === "done").length / weekTasks.length) * 100
        : 0,
      aiSummary: review.summary,
      adjustments: review.adjustments,
      metadata: {
        riskLevel: review.riskLevel,
        nextWeekTasks: review.nextWeekTasks.map((t) => ({
          day: t.day,
          title: t.title,
          detail: t.detail,
          minutes: t.minutes,
        })),
        streakDays: streak,
        generatedAt: new Date().toISOString(),
      },
    },
  });

  return {
    status: "created",
    reportId: report.id,
    riskLevel: review.riskLevel,
    summary: review.summary,
    adjustments: review.adjustments,
    completionRate: report.completionRate,
    nextWeekTasks: review.nextWeekTasks,
  };
}
