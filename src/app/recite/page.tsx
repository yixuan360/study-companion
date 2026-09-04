import Link from "next/link";
import { getTodayReviewCards } from "@/modules/recite/today";
import { getReviewStats } from "@/modules/recite/stats";
import { BackLink } from "@/app/_components/BackLink";
import { SendReminderButton } from "./SendReminderButton";

export default async function RecitePage() {
  const { totalCount } = await getTodayReviewCards();
  const { totalReviews, streakDays } = await getReviewStats();

  const actions = [
    {
      href: "/recite/review",
      title: "开始复习",
      description: totalCount > 0 ? `今日 ${totalCount} 张待复习` : "今日复习已完成",
      colorClass: "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300",
    },
    {
      href: "/recite/materials",
      title: "我的材料",
      description: "查看已录入的学习材料与卡片",
      colorClass: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300",
    },
    {
      href: "/recite/import",
      title: "录入新材料",
      description: "粘贴文字，AI 辅助制卡",
      colorClass: "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300",
    },
  ];

  return (
    <main className="min-h-svh bg-zinc-50 px-4 py-10 dark:bg-black sm:px-6">
      <div className="mx-auto max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-3 text-5xl">🎴</div>
          <h1 className="mb-2 text-2xl font-bold text-zinc-900 dark:text-zinc-50">背诵记忆卡</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">艾宾浩斯间隔重复，让记忆更持久</p>
          {(totalReviews > 0 || streakDays > 0) && (
            <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
              累计复习 {totalReviews} 次 · 连续复习 {streakDays} 天
            </p>
          )}
        </div>

        <div className="space-y-3">
          {actions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="flex items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-indigo-300 hover:shadow-md active:scale-[0.98] dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-indigo-900/50"
            >
              <div
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-xl ${action.colorClass}`}
              >
                {action.href === "/recite/review" && "▶"}
                {action.href === "/recite/materials" && "📂"}
                {action.href === "/recite/import" && "✍️"}
              </div>
              <div>
                <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">{action.title}</h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">{action.description}</p>
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-6">
          <SendReminderButton />
        </div>

        <div className="mt-8 text-center">
          <BackLink href="/">返回首页</BackLink>
        </div>
      </div>
    </main>
  );
}
