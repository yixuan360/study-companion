import { prisma } from "@/lib/db";
import { getTodayReviewCards } from "@/modules/recite/today";
import { addDays, startOfToday } from "@/modules/companion/plan";
import { daysUntil } from "@/modules/companion/stats";
import { getCurrentUser } from "@/lib/auth";
import { ModuleCard } from "./_components/ModuleCard";

const modules = [
  {
    href: "/recite",
    title: "背诵记忆卡",
    description: "卡片式记忆与间隔复习",
    emoji: "🎴",
    colorClass: "bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-300",
  },
  {
    href: "/companion",
    title: "备考任务陪伴",
    description: "任务规划与每日督学",
    emoji: "📚",
    colorClass: "bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-300",
  },
  {
    href: "/classroom",
    title: "班级作业共享",
    description: "班级协作与作业同步",
    emoji: "🏫",
    colorClass: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300",
  },
  {
    href: "/graph",
    title: "知识图谱",
    description: "知识点关联可视化",
    emoji: "🧠",
    colorClass: "bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-300",
  },
];

async function getCompanionBadge(): Promise<string | undefined> {
  const today = startOfToday();
  const goals = await prisma.goal.findMany({
    where: { status: "active" },
    orderBy: { deadline: "asc" },
  });
  if (goals.length === 0) return undefined;

  const todayTasks = await prisma.task.findMany({
    where: {
      goalId: { in: goals.map((g) => g.id) },
      dueDate: { gte: today, lt: addDays(today, 1) },
    },
    select: { status: true },
  });
  const doneCount = todayTasks.filter((t) => t.status === "done").length;
  const daysLeft = Math.max(0, daysUntil(goals[0].deadline, today));

  return `剩 ${daysLeft} 天 · 今日 ${doneCount}/${todayTasks.length}`;
}

/** 班级角标：未来 3 天内到期、且我未完成的任务数（跨所有我加入的班级） */
async function getClassroomBadge(): Promise<string | undefined> {
  const user = await getCurrentUser();
  if (!user) return undefined;

  const memberships = await prisma.classroomMember.findMany({
    where: { userId: user.id },
    select: { classroomId: true },
  });
  if (memberships.length === 0) return undefined;

  const now = new Date();
  const inThreeDays = new Date(now.getTime() + 3 * 86_400_000);
  const tasks = await prisma.classTask.findMany({
    where: {
      classroomId: { in: memberships.map((m) => m.classroomId) },
      deadline: { gte: now, lt: inThreeDays },
    },
    select: { id: true },
  });
  if (tasks.length === 0) return undefined;

  const completions = await prisma.taskCompletion.findMany({
    where: { userId: user.id, done: true, taskId: { in: tasks.map((t) => t.id) } },
    select: { taskId: true },
  });
  const doneIds = new Set(completions.map((c) => c.taskId));
  const todoCount = tasks.filter((t) => !doneIds.has(t.id)).length;

  return todoCount > 0 ? `3 天内 ${todoCount} 项到期` : undefined;
}

export default async function Home() {
  const { totalCount } = await getTodayReviewCards();
  const [companionBadge, classroomBadge] = await Promise.all([
    getCompanionBadge(),
    getClassroomBadge(),
  ]);

  return (
    <main className="min-h-svh bg-zinc-50 px-4 py-10 dark:bg-black sm:px-6">
      <div className="mx-auto max-w-md sm:max-w-lg">
        <div className="mb-8 text-center">
          <h1 className="mb-2 text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            学习伴侣
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            四个模块，陪你高效学习
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {modules.map((m) => (
            <ModuleCard
              key={m.href}
              {...m}
              badgeCount={m.href === "/recite" ? totalCount : undefined}
              badgeText={
                m.href === "/companion"
                  ? companionBadge
                  : m.href === "/classroom"
                    ? classroomBadge
                    : undefined
              }
            />
          ))}
        </div>
      </div>
    </main>
  );
}
