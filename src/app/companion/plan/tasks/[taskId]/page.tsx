import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { BackLink } from "@/app/_components/BackLink";
import { TaskEditForm } from "./TaskEditForm";

export default async function CompanionTaskEditPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const { taskId } = await params;
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) notFound();

  const goal = await prisma.goal.findUnique({
    where: { id: task.goalId },
    select: { id: true, title: true },
  });

  // date input 需要 YYYY-MM-DD（本地时区）
  const dueDateISO = `${task.dueDate.getFullYear()}-${String(task.dueDate.getMonth() + 1).padStart(2, "0")}-${String(task.dueDate.getDate()).padStart(2, "0")}`;

  return (
    <main className="min-h-svh bg-zinc-50 px-4 py-6 dark:bg-black sm:px-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6">
          <BackLink href={`/companion/plan?goalId=${task.goalId}`}>
            返回周计划{goal ? `（${goal.title}）` : ""}
          </BackLink>
        </div>
        <h1 className="mb-1 text-2xl font-bold text-zinc-900 dark:text-zinc-50">编辑任务</h1>
        <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
          手动调整执行中的任务：改内容、改期或删除
        </p>
        <TaskEditForm
          taskId={task.id}
          goalId={task.goalId}
          initialTitle={task.title}
          initialDetail={task.detail}
          initialMinutes={task.estMinutes}
          initialDueDate={dueDateISO}
          status={task.status}
        />
      </div>
    </main>
  );
}
