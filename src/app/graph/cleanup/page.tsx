import { prisma } from "@/lib/db";
import { BackLink } from "@/app/_components/BackLink";
import { GraphTabs } from "../_components/GraphTabs";
import { CleanupList, type CleanupItem } from "./CleanupList";

function formatDate(d: Date): string {
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

// 管理页数据随时变化，跳过构建期静态化（同 review/sources 靠 revalidate 不同，这里始终实时）
export const dynamic = "force-dynamic";

export default async function GraphCleanupPage() {
  // pendingCleanup 存 metadata（Json），SQLite 上不做 JSON path 过滤，库内先按 mentionCount=0 收窄再内存过滤
  const zeroMention = await prisma.graphNode.findMany({
    where: { mentionCount: 0 },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, domain: true, summary: true, metadata: true, updatedAt: true },
  });
  const items: CleanupItem[] = zeroMention
    .filter(
      (n) =>
        (n.metadata as Record<string, unknown> | null)?.pendingCleanup === true
    )
    .map((n) => ({
      id: n.id,
      name: n.name,
      domain: n.domain,
      summary: n.summary,
      markedAtLabel:
        typeof (n.metadata as Record<string, unknown>).pendingCleanupAt ===
        "string"
          ? formatDate(
              new Date(
                (n.metadata as Record<string, unknown>).pendingCleanupAt as string
              )
            )
          : null,
    }));

  return (
    <main className="min-h-svh bg-zinc-50 px-4 py-6 pb-24 sm:px-6 sm:pb-6 dark:bg-black">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6">
          <BackLink href="/graph">返回图谱</BackLink>
        </div>
        <GraphTabs />

        <h1 className="mb-1 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          待清理节点
        </h1>
        <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
          共 {items.length} 个。删除来源后提及次数归零的知识点会暂存这里：
          确认删除会连同关系边与溯源一并清除；恢复则保留节点、提及次数重置为 1。
        </p>

        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center dark:border-zinc-700 dark:bg-zinc-900">
            <div className="mb-2 text-4xl">✅</div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              没有待清理节点，图谱很干净
            </p>
          </div>
        ) : (
          <CleanupList items={items} />
        )}
      </div>
    </main>
  );
}
