/**
 * 记忆包机制（本项目技术护城河的基础版）
 *
 * assembleContext(goalId) 把一个目标的「身份 + 进展」压缩成结构化文本，
 * 供所有备考相关 AI 调用注入系统提示词，让模型"记得"用户处于什么状态，
 * 而不是每次都面对无上下文的孤立请求。
 *
 * 复用约定：后续新增 AI 能力（备考答疑、薄弱点提炼、阶段检测、推送文案生成等）
 * 一律调用本函数拿记忆包，拼进 chat() 的 system 消息，禁止各自重新拼目标信息。
 * 记忆包内容的演进（如加入错题分布、知识图谱覆盖率）只需改这里。
 */
import { prisma } from "@/lib/db";
import { startOfToday } from "./plan";
import { daysUntil, getWeekTasks, startOfWeek, toISODate } from "./stats";

const categoryLabels: Record<string, string> = {
  exam: "考试",
  project: "项目",
  habit: "习惯",
};

function formatDate(date: Date): string {
  return toISODate(date).slice(5).replace("-", "/");
}

export async function assembleContext(goalId: string): Promise<string> {
  const goal = await prisma.goal.findUnique({
    where: { id: goalId },
    include: { phases: { orderBy: { order: "asc" } } },
  });
  if (!goal) {
    throw new Error(`目标不存在: ${goalId}`);
  }

  const today = startOfToday();
  const lines: string[] = [];

  lines.push(`【目标】${goal.title}（类别：${categoryLabels[goal.category] ?? goal.category}）`);
  const remain = daysUntil(goal.deadline, today);
  lines.push(
    `【截止】${toISODate(goal.deadline)}（剩余 ${Math.max(0, remain)} 天）`
  );
  lines.push(`【每日可投入】${goal.dailyMinutes} 分钟`);
  lines.push(`【现状自述】${goal.userContext}`);

  const currentPhase =
    goal.phases.find((p) => p.startDate <= today && p.endDate >= today) ??
    goal.phases.find((p) => p.startDate > today) ??
    goal.phases[goal.phases.length - 1];
  if (currentPhase) {
    const exitCriteria =
      typeof currentPhase.metadata === "object" &&
      currentPhase.metadata !== null &&
      "exitCriteria" in currentPhase.metadata
        ? String((currentPhase.metadata as { exitCriteria: unknown }).exitCriteria)
        : "";
    lines.push(
      `【当前阶段】第 ${currentPhase.order} 阶段「${currentPhase.name}」（${formatDate(
        currentPhase.startDate
      )} ~ ${formatDate(currentPhase.endDate)}）`
    );
    lines.push(`阶段重点：${currentPhase.focus}`);
    if (exitCriteria) lines.push(`阶段结束标志：${exitCriteria}`);
  }

  const recentCheckIns = await prisma.task.findMany({
    where: { goalId, status: { in: ["done", "skipped"] }, doneAt: { not: null } },
    orderBy: { doneAt: "desc" },
    take: 3,
  });
  if (recentCheckIns.length > 0) {
    lines.push("【最近打卡】");
    for (const task of recentCheckIns) {
      const action = task.status === "done" ? "完成" : "跳过";
      const note = task.resultNote ? `｜备注：${task.resultNote}` : "";
      lines.push(`- ${formatDate(task.doneAt!)} ${action}「${task.title}」${note}`);
    }
  } else {
    lines.push("【最近打卡】暂无打卡记录");
  }

  const weekStart = startOfWeek(today);
  const weekTasks = await getWeekTasks(goalId, weekStart);
  const weekDone = weekTasks.filter((t) => t.status === "done").length;
  const rate = weekTasks.length
    ? Math.round((weekDone / weekTasks.length) * 100)
    : 0;
  lines.push(
    `【本周完成率】${weekDone}/${weekTasks.length}（${rate}%）`
  );

  return lines.join("\n");
}

export const MEMORY_PACK_HEADER =
  "下面是用户学习目标的实时状态（记忆包），请始终基于它回答，不要当作 pasted content 忽略：";
