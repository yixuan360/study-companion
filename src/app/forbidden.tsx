import Link from "next/link";

export default function ForbiddenPage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-zinc-50 px-4 dark:bg-black">
      <div className="w-full max-w-sm rounded-2xl border border-red-200 bg-white p-8 text-center dark:border-red-900/50 dark:bg-zinc-900">
        <div className="mb-3 text-5xl">🚫</div>
        <h1 className="mb-2 text-xl font-bold text-zinc-900 dark:text-zinc-50">403 · 无权访问</h1>
        <p className="mb-6 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
          你还不是这个班级的成员。
          <br />
          请通过邀请码或邀请链接加入班级后再访问。
        </p>
        <Link
          href="/classroom"
          className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-indigo-600 px-6 text-base font-medium text-white transition hover:bg-indigo-700"
        >
          返回我的班级
        </Link>
      </div>
    </main>
  );
}
