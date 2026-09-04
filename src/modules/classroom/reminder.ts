import { prisma } from "@/lib/db";
import { pushToUser } from "@/lib/push";

export type ClassroomPushMode = "morning" | "evening";

export interface ClassroomPushDetail {
  userId: string;
  userName: string;
  ok: boolean;
  reason?: string;
}

export interface ClassroomPushResult {
  mode: ClassroomPushMode;
  notified: number;
  skippedNoTodo: number;
  failed: number;
  details: ClassroomPushDetail[];
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function formatDeadline(d: Date): string {
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function buildTaskLines(
  tasks: {
    title: string;
    platform: string;
    course: string | null;
    deadline: Date;
    classroomName: string;
  }[]
): string {
  return tasks
    .map(
      (t) =>
        `- **${t.title}**\n  ${formatDeadline(t.deadline)} 前 · ${t.platform}` +
        (t.course ? ` · ${t.course}` : "") +
        ` · ${t.classroomName}`
    )
    .join("\n");
}

/**
 * 班级任务定时提醒：对绑定了 Server酱 SendKey 的成员推送各自未完成的到期任务。
 * - morning（早 8 点简报）：今天内到期的未完成任务清单；
 * - evening（晚 8 点预警）：未来 24 小时内到期的未完成任务。
 * 无待办不推送，不打扰。
 */
export async function sendClassroomTaskPush(
  mode: ClassroomPushMode
): Promise<ClassroomPushResult> {
  const now = new Date();
  const windowStart = mode === "morning" ? startOfDay(now) : now;
  const windowEnd =
    mode === "morning"
      ? new Date(startOfDay(now).getTime() + 86_400_000)
      : new Date(now.getTime() + 24 * 3_600_000);

  // 只服务：绑定了 pushKey 且至少加入了一个班级的成员
  const memberUserIds = (
    await prisma.classroomMember.findMany({
      select: { userId: true },
      distinct: ["userId"],
    })
  ).map((m) => m.userId);
  const users = await prisma.user.findMany({
    where: { pushKey: { not: null }, id: { in: memberUserIds } },
  });

  const result: ClassroomPushResult = {
    mode,
    notified: 0,
    skippedNoTodo: 0,
    failed: 0,
    details: [],
  };

  for (const user of users) {
    const memberships = await prisma.classroomMember.findMany({
      where: { userId: user.id },
      include: { classroom: { select: { id: true, name: true } } },
    });
    if (memberships.length === 0) continue;

    const tasks = await prisma.classTask.findMany({
      where: {
        classroomId: { in: memberships.map((m) => m.classroomId) },
        deadline: { gte: windowStart, lt: windowEnd },
      },
      include: { classroom: { select: { name: true } } },
      orderBy: { deadline: "asc" },
    });

    const completions = await prisma.taskCompletion.findMany({
      where: { userId: user.id, done: true, taskId: { in: tasks.map((t) => t.id) } },
      select: { taskId: true },
    });
    const doneTaskIds = new Set(completions.map((c) => c.taskId));
    const todo = tasks.filter((t) => !doneTaskIds.has(t.id));

    if (todo.length === 0) {
      result.skippedNoTodo += 1;
      result.details.push({
        userId: user.id,
        userName: user.name ?? "",
        ok: false,
        reason: "无待办，未推送",
      });
      continue;
    }

    const title =
      mode === "morning"
        ? `📚 今日到期：${todo.length} 项任务`
        : `⏰ 明天截止：${todo.length} 项任务`;
    const content = buildTaskLines(
      todo.map((t) => ({
        title: t.title,
        platform: t.platform,
        course: t.course,
        deadline: t.deadline,
        classroomName: t.classroom.name,
      }))
    );

    const pushResult = await pushToUser({
      sendKey: user.pushKey!,
      title,
      content,
    });

    if (pushResult.success) {
      result.notified += 1;
    } else {
      result.failed += 1;
    }
    result.details.push({
      userId: user.id,
      userName: user.name ?? "",
      ok: pushResult.success,
      reason: pushResult.success ? undefined : pushResult.error,
    });
  }

  return result;
}
