import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { BackLink } from "@/app/_components/BackLink";
import { CreateJoinForms } from "./CreateJoinForms";

export default async function ClassroomPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const user = await getCurrentUser();
  if (!user) {
    redirect("/classroom/identity");
  }

  const memberships = await prisma.classroomMember.findMany({
    where: { userId: user.id },
    include: {
      classroom: {
        include: { _count: { select: { members: true } } },
      },
    },
    orderBy: { joinedAt: "asc" },
  });

  return (
    <main className="min-h-svh bg-zinc-50 px-4 py-6 dark:bg-black sm:px-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6">
          <BackLink href="/">返回首页</BackLink>
        </div>

        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">班级作业共享</h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              你好，{user.name} · 一人录入、全班受益
            </p>
          </div>
          <Link
            href="/classroom/settings"
            className="min-h-[36px] rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            设置
          </Link>
        </div>

        {error === "invalid-code" && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
            邀请码无效或已失效，请向班长重新确认
          </div>
        )}

        {error === "invite-expired" && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
            邀请码已过期，请联系班长重新生成
          </div>
        )}

        {memberships.length === 0 ? (
          <div className="mb-6 rounded-2xl border border-dashed border-zinc-300 bg-white p-6 text-center dark:border-zinc-700 dark:bg-zinc-900">
            <div className="mb-2 text-4xl">📭</div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              还没有加入任何班级，创建一个或用邀请码加入
            </p>
          </div>
        ) : (
          <div className="mb-6 space-y-3">
            <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
              我的班级（{memberships.length}）
            </h2>
            {memberships.map(({ classroom }) => (
              <Link
                key={classroom.id}
                href={`/classroom/${classroom.id}`}
                className="flex items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-indigo-300 hover:shadow-md active:scale-[0.98] dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-indigo-900/50"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-xl dark:bg-emerald-900/30">
                  🏫
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-zinc-900 dark:text-zinc-50">
                    {classroom.name}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {classroom._count.members} 名成员
                    {classroom.creatorId === user.id && " · 我创建的"}
                  </p>
                </div>
                <span aria-hidden className="text-zinc-300 dark:text-zinc-600">›</span>
              </Link>
            ))}
          </div>
        )}

        <CreateJoinForms />
      </div>
    </main>
  );
}
