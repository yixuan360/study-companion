import { prisma } from "@/lib/db";
import { addDays, startOfToday } from "@/modules/companion/plan";
import { BackLink } from "@/app/_components/BackLink";
import TodayClient from "./TodayClient";

const statusOrder: Record<string, number> = { pending: 0, done: 1, skipped: 2 };

export default async function CompanionTodayPage() {
  const today = startOfToday();
  const goals = await prisma.goal.findMany({
    where: { status: "active" },
    orderBy: { createdAt: "asc" },
  });

  const sections = [];
  for (const goal of goals) {
    const tasks = await prisma.task.findMany({
      where: { goalId: goal.id, dueDate: { gte: today, lt: addDays(today, 1) } },
      orderBy: { createdAt: "asc" },
    });
    if (tasks.length === 0) continue;
    sections.push({
      goalId: goal.id,
      goalTitle: goal.title,
      tasks: [...tasks].sort(
        (a, b) =>
          (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9)
      ),
    });
  }

  return (
    <main className="min-h-svh bg-zinc-50 px-4 py-6 dark:bg-black sm:px-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6">
          <BackLink href="/companion">返回陪伴模块</BackLink>
        </div>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">今日任务</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            逐项打卡，完成后可填写结果备注
          </p>
        </div>

        {sections.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center dark:border-zinc-700 dark:bg-zinc-900">
            <div className="mb-3 text-4xl">☕</div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              今天没有安排任务，去周计划看看后续安排吧
            </p>
          </div>
        ) : (
          <TodayClient sections={sections} />
        )}
      </div>
    </main>
  );
}
