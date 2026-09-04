import Link from "next/link";
import { BackLink } from "@/app/_components/BackLink";
import { GraphTabs } from "../_components/GraphTabs";
import { getSourceSummaries } from "@/modules/graph/actions";

function formatDate(d: Date): string {
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

export default async function GraphSourcesPage() {
  const sources = await getSourceSummaries();

  return (
    <main className="min-h-svh bg-zinc-50 px-4 py-6 pb-24 sm:px-6 sm:pb-6 dark:bg-black">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6">
          <BackLink href="/graph">返回图谱</BackLink>
        </div>
        <GraphTabs />

        <h1 className="mb-1 text-2xl font-bold text-zinc-900 dark:text-zinc-50">来源管理</h1>
        <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
          喂入过的所有材料（{sources.length} 篇）。删除来源不会删知识点，只减少提及次数
        </p>

        {sources.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center dark:border-zinc-700 dark:bg-zinc-900">
            <div className="mb-2 text-4xl">📚</div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              还没有喂入过材料，去
              <Link href="/graph/import" className="text-violet-600 underline dark:text-violet-300">
                喂入页
              </Link>
              添加第一篇
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {sources.map((s) => (
              <Link
                key={s.id}
                href={`/graph/sources/${s.id}`}
                className="flex items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-violet-300 hover:shadow-md active:scale-[0.98] dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-violet-900/50"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-xl dark:bg-violet-900/30">
                  📄
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-zinc-900 dark:text-zinc-50">
                    {s.title}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {formatDate(s.createdAt)} · 提炼 {s.nodeCount} 个知识点
                  </p>
                </div>
                <span aria-hidden className="text-zinc-300 dark:text-zinc-600">›</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
