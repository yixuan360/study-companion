import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { BackLink } from "@/app/_components/BackLink";
import IdentityForm from "./IdentityForm";

export default async function IdentityPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  const user = await getCurrentUser();
  if (user) {
    redirect(code ? `/classroom/join?code=${encodeURIComponent(code)}` : "/classroom");
  }

  return (
    <main className="min-h-svh bg-zinc-50 px-4 py-6 dark:bg-black sm:px-6">
      <div className="mx-auto max-w-md">
        <div className="mb-6">
          <BackLink href="/">返回首页</BackLink>
        </div>
        <div className="mb-8 text-center">
          <div className="mb-3 text-5xl">🏫</div>
          <h1 className="mb-2 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            创建你的身份
          </h1>
          <p className="text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
            {code
              ? "创建身份后将自动加入邀请的班级"
              : "班级作业共享需要先创建身份，无需注册密码，一个昵称即可"}
          </p>
        </div>
        <IdentityForm inviteCode={code ?? ""} />
        <p className="mt-6 text-center text-xs text-zinc-400 dark:text-zinc-500">
          MVP 轻量账号：身份保存在本设备 Cookie（30 天有效），换设备需重新创建
        </p>
      </div>
    </main>
  );
}
