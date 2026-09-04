import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { BackLink } from "@/app/_components/BackLink";
import { SettingsForms } from "./SettingsForms";

export default async function ClassroomSettingsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/classroom/identity");
  }

  const memberships = await prisma.classroomMember.findMany({
    where: { userId: user.id },
    include: { classroom: { select: { id: true, name: true } } },
    orderBy: { joinedAt: "asc" },
  });

  return (
    <main className="min-h-svh bg-zinc-50 px-4 py-6 dark:bg-black sm:px-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6">
          <BackLink href="/classroom">返回我的班级</BackLink>
        </div>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">个人设置</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            绑定微信推送，任务到期前自动提醒
          </p>
        </div>

        <section className="mb-6 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-3 font-semibold text-zinc-900 dark:text-zinc-50">我的信息</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex gap-2">
              <dt className="w-16 shrink-0 text-zinc-500 dark:text-zinc-400">昵称</dt>
              <dd className="text-zinc-900 dark:text-zinc-50">{user.name ?? "-"}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-16 shrink-0 text-zinc-500 dark:text-zinc-400">学号</dt>
              <dd className="text-zinc-900 dark:text-zinc-50">{user.studentNo ?? "未填写"}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-16 shrink-0 text-zinc-500 dark:text-zinc-400">已加入</dt>
              <dd className="flex flex-wrap gap-1.5">
                {memberships.length === 0 ? (
                  <span className="text-zinc-400 dark:text-zinc-500">还没有加入班级</span>
                ) : (
                  memberships.map((m) => (
                    <Link
                      key={m.classroom.id}
                      href={`/classroom/${m.classroom.id}`}
                      className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-600 transition hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300"
                    >
                      {m.classroom.name}
                    </Link>
                  ))
                )}
              </dd>
            </div>
          </dl>
        </section>

        <SettingsForms pushKey={user.pushKey ?? ""} />

        <p className="mt-6 text-center text-xs text-zinc-400 dark:text-zinc-500">
          提醒时间：每天早 8 点今日简报、晚 8 点明日预警，无待办不打扰
        </p>
      </div>
    </main>
  );
}
