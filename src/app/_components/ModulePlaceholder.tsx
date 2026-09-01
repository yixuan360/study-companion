import Link from "next/link";

interface ModulePlaceholderProps {
  title: string;
  emoji: string;
}

export function ModulePlaceholder({ title, emoji }: ModulePlaceholderProps) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 text-6xl">{emoji}</div>
      <h1 className="mb-2 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
        {title}
      </h1>
      <p className="mb-8 text-zinc-500 dark:text-zinc-400">模块开发中，敬请期待</p>
      <Link
        href="/"
        className="rounded-full bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        返回首页
      </Link>
    </main>
  );
}
