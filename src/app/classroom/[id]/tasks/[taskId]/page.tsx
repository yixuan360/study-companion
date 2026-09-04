import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { requireMembership } from "@/modules/classroom/membership";
import { BackLink } from "@/app/_components/BackLink";
import { TaskEditForm } from "./TaskEditForm";

export default async function TaskEditPage({
  params,
}: {
  params: Promise<{ id: string; taskId: string }>;
}) {
  const { id, taskId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    redirect("/classroom/identity");
  }

  const classroom = await prisma.classroom.findUnique({
    where: { id },
    select: { name: true },
  });
  if (!classroom) {
    notFound();
  }

  // 隔离纪律：先校验成员身份，再取本班级内的任务
  await requireMembership(id, user.id);

  const task = await prisma.classTask.findFirst({
    where: { id: taskId, classroomId: id },
  });
  if (!task) {
    notFound();
  }

  const involvedIds = [task.createdBy, task.updatedBy].filter(
    (x): x is string => !!x
  );
  const users = await prisma.user.findMany({
    where: { id: { in: involvedIds } },
    select: { id: true, name: true },
  });
  const nameById = new Map(users.map((u) => [u.id, u.name ?? "已注销成员"]));

  return (
    <main className="min-h-svh bg-zinc-50 px-4 py-6 dark:bg-black sm:px-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6">
          <BackLink href={`/classroom/${id}`}>返回班级空间</BackLink>
        </div>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">编辑任务</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {classroom.name} · 任何成员都可以修改（如老师改期）
          </p>
        </div>

        <TaskEditForm
          classroomId={id}
          task={{
            id: task.id,
            title: task.title,
            detail: task.detail,
            platform: task.platform,
            course: task.course ?? "",
            type: task.type,
            deadlineISO: task.deadline.toISOString(),
          }}
          meta={{
            createdByName: nameById.get(task.createdBy) ?? "已注销成员",
            createdAtLabel: `${task.createdAt.getFullYear()}/${task.createdAt.getMonth() + 1}/${task.createdAt.getDate()} ${String(task.createdAt.getHours()).padStart(2, "0")}:${String(task.createdAt.getMinutes()).padStart(2, "0")}`,
            updatedByName: task.updatedBy ? nameById.get(task.updatedBy) ?? null : null,
            updatedAtLabel: task.updatedBy
              ? `${task.updatedAt.getFullYear()}/${task.updatedAt.getMonth() + 1}/${task.updatedAt.getDate()} ${String(task.updatedAt.getHours()).padStart(2, "0")}:${String(task.updatedAt.getMinutes()).padStart(2, "0")}`
              : null,
          }}
        />
      </div>
    </main>
  );
}
