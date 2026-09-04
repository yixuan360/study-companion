import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { BackLink } from "@/app/_components/BackLink";
import { JoinClient } from "./JoinClient";

export default async function ClassroomJoinPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  const user = await getCurrentUser();
  if (!code?.trim()) {
    redirect("/classroom");
  }
  if (!user) {
    redirect(`/classroom/identity?code=${encodeURIComponent(code.trim())}`);
  }

  return (
    <main className="min-h-svh bg-zinc-50 px-4 py-6 dark:bg-black sm:px-6">
      <div className="mx-auto max-w-md">
        <div className="mb-6">
          <BackLink href="/classroom">返回我的班级</BackLink>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-3 text-5xl">🏫</div>
          <h1 className="mb-2 text-xl font-bold text-zinc-900 dark:text-zinc-50">
            加入班级
          </h1>
          <p className="mb-1 text-sm text-zinc-500 dark:text-zinc-400">
            邀请码 <span className="font-mono font-semibold text-indigo-600 dark:text-indigo-300">{code}</span>
          </p>
          <JoinClient code={code.trim()} />
          <p className="mt-4 text-xs text-zinc-400 dark:text-zinc-500">
            加入后可在<Link href="/classroom/settings" className="text-indigo-600 underline dark:text-indigo-400">设置</Link>里绑定微信提醒
          </p>
        </div>
      </div>
    </main>
  );
}
