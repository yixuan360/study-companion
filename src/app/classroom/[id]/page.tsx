import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { requireMembership } from "@/modules/classroom/membership";
import { BackLink } from "@/app/_components/BackLink";
import { InviteCodeCard } from "./InviteCodeCard";
import { TaskSection, type TaskItem } from "./TaskSection";

export default async function ClassroomSpacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) {
    redirect("/classroom/identity");
  }

  const classroom = await prisma.classroom.findUnique({ where: { id } });
  if (!classroom) {
    notFound();
  }

  // 数据隔离纪律：非班级成员一律 403
  await requireMembership(classroom.id, user.id);

  const members = await prisma.classroomMember.findMany({
    where: { classroomId: classroom.id },
    orderBy: { joinedAt: "asc" },
  });
  const users = await prisma.user.findMany({
    where: { id: { in: members.map((m) => m.userId) } },
    select: { id: true, name: true, studentNo: true },
  });
  const nameById = new Map(users.map((u) => [u.id, u.name ?? "已注销成员"]));

  // 隔离纪律：查询恒带 classroomId
  const tasks = await prisma.classTask.findMany({
    where: { classroomId: classroom.id },
    orderBy: { deadline: "asc" },
  });
  const completions = await prisma.taskCompletion.findMany({
    where: { taskId: { in: tasks.map((t) => t.id) }, userId: user.id },
  });
  const doneTaskIds = new Set(
    completions.filter((c) => c.done).map((c) => c.taskId)
  );

  const taskItems: TaskItem[] = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    detail: t.detail,
    platform: t.platform,
    course: t.course,
    type: t.type,
    deadlineISO: t.deadline.toISOString(),
    createdByName: nameById.get(t.createdBy) ?? "已注销成员",
    updatedByName: t.updatedBy ? nameById.get(t.updatedBy) ?? "已注销成员" : null,
    myDone: doneTaskIds.has(t.id),
  }));

  return (
    <main className="min-h-svh bg-zinc-50 px-4 py-6 dark:bg-black sm:px-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6">
          <BackLink href="/classroom">返回我的班级</BackLink>
        </div>

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            {classroom.name}
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {members.length} 名成员 · 一人录入、全班受益
          </p>
        </div>

        <div className="mb-6">
          <InviteCodeCard
            classroomName={classroom.name}
            inviteCode={classroom.inviteCode}
          />
        </div>

        <TaskSection
          classroomId={classroom.id}
          tasks={taskItems}
          currentUserName={user.name ?? ""}
        />

        <section className="mb-24 sm:mb-6">
          <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            成员（{members.length}）
          </h2>
          <div className="rounded-2xl border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-900">
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {members.map((member, index) => {
                const u = users.find((x) => x.id === member.userId);
                return (
                  <li
                    key={member.id}
                    className="flex items-center gap-3 px-3 py-2.5"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-sm font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">
                        {u?.name ?? "已注销成员"}
                      </p>
                      {u?.studentNo && (
                        <p className="text-xs text-zinc-400 dark:text-zinc-500">
                          学号 {u.studentNo}
                        </p>
                      )}
                    </div>
                    {member.userId === classroom.creatorId && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                        班长
                      </span>
                    )}
                    {member.userId === user.id && (
                      <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                        我
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      </div>
    </main>
  );
}
