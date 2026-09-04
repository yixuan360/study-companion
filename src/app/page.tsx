import { getTodayReviewCards } from "@/modules/recite/today";
import { ModuleCard } from "./_components/ModuleCard";

const modules = [
  {
    href: "/recite",
    title: "背诵记忆卡",
    description: "卡片式记忆与间隔复习",
    emoji: "🎴",
    colorClass: "bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-300",
  },
  {
    href: "/companion",
    title: "备考任务陪伴",
    description: "任务规划与每日督学",
    emoji: "📚",
    colorClass: "bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-300",
  },
  {
    href: "/classroom",
    title: "班级作业共享",
    description: "班级协作与作业同步",
    emoji: "🏫",
    colorClass: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300",
  },
  {
    href: "/graph",
    title: "知识图谱",
    description: "知识点关联可视化",
    emoji: "🧠",
    colorClass: "bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-300",
  },
];

export default async function Home() {
  const { totalCount } = await getTodayReviewCards();

  return (
    <main className="min-h-svh bg-zinc-50 px-4 py-10 dark:bg-black sm:px-6">
      <div className="mx-auto max-w-md sm:max-w-lg">
        <div className="mb-8 text-center">
          <h1 className="mb-2 text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            学习伴侣
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            四个模块，陪你高效学习
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {modules.map((m) => (
            <ModuleCard
              key={m.href}
              {...m}
              badgeCount={m.href === "/recite" ? totalCount : undefined}
            />
          ))}
        </div>
      </div>
    </main>
  );
}
