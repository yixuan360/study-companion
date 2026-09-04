import Link from "next/link";
import { prisma } from "@/lib/db";
import { BackLink } from "@/app/_components/BackLink";
import { GraphTabs } from "./_components/GraphTabs";
import { GraphView } from "./GraphView";

export default async function GraphPage() {
  const nodeCount = await prisma.graphNode.count();

  return (
    <main className="min-h-svh bg-zinc-50 px-4 py-6 pb-24 sm:px-6 sm:pb-6 dark:bg-black">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6">
          <BackLink href="/">返回首页</BackLink>
        </div>
        <GraphTabs />

        {nodeCount === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center dark:border-zinc-700 dark:bg-zinc-900">
            <div className="mb-3 text-5xl">🕸️</div>
            <h1 className="mb-2 text-xl font-bold text-zinc-900 dark:text-zinc-50">
              你的知识图谱还是空的
            </h1>
            <p className="mb-6 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
              只管「喂」知识：粘贴文章或笔记，
              <br />
              AI 自动提炼知识点和关联，图谱会持续生长
            </p>
            <Link
              href="/graph/import"
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-violet-600 px-6 text-base font-medium text-white transition hover:bg-violet-700"
            >
              去喂入第一篇知识 →
            </Link>
          </div>
        ) : (
          <GraphView />
        )}
      </div>
    </main>
  );
}
