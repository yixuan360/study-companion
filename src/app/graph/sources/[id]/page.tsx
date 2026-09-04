import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { BackLink } from "@/app/_components/BackLink";
import { DeleteSourceButton } from "./DeleteSourceButton";

interface SnapshotEntity {
  name: string;
  aliases: string[];
  summary: string;
}

interface SnapshotRelation {
  from: string;
  relation: string;
  to: string;
  evidence: string;
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

export default async function SourceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const source = await prisma.source.findUnique({ where: { id } });
  if (!source) notFound();

  const nodeSources = await prisma.nodeSource.findMany({
    where: { sourceId: source.id },
    include: { node: { select: { id: true, name: true, domain: true } } },
  });

  const meta = (source.metadata ?? {}) as {
    domain?: string;
    entities?: SnapshotEntity[];
    relations?: SnapshotRelation[];
  };

  return (
    <main className="min-h-svh bg-zinc-50 px-4 py-6 pb-24 sm:px-6 sm:pb-6 dark:bg-black">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6">
          <BackLink href="/graph/sources">返回来源列表</BackLink>
        </div>

        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
              {source.title}
            </h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {formatDate(source.createdAt)} · 领域 {meta.domain ?? "未分类"}
            </p>
          </div>
          <DeleteSourceButton sourceId={source.id} />
        </div>

        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            关联知识点（{nodeSources.length}）
          </h2>
          {nodeSources.length === 0 ? (
            <p className="text-sm text-zinc-400 dark:text-zinc-500">
              该来源当前没有关联知识点（可能相关节点已被清理）
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {nodeSources.map((ns) => (
                <Link
                  key={ns.id}
                  href={`/graph/sources/${source.id}#node-${ns.nodeId}`}
                  className="rounded-full bg-violet-100 px-3 py-1 text-xs font-medium text-violet-700 transition hover:bg-violet-200 dark:bg-violet-900/30 dark:text-violet-300"
                >
                  {ns.node.name}
                </Link>
              ))}
            </div>
          )}
        </section>

        {meta.entities && meta.entities.length > 0 && (
          <section className="mb-6">
            <h2 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              本次提炼（实体 {meta.entities.length} · 关系 {meta.relations?.length ?? 0}）
            </h2>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {meta.entities.map((e) => (
                <span
                  key={e.name}
                  className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                  title={e.summary}
                >
                  {e.name}
                </span>
              ))}
            </div>
            <ul className="space-y-1">
              {meta.relations?.map((r, i) => (
                <li key={i} className="text-sm text-zinc-700 dark:text-zinc-300">
                  <span className="font-medium">{r.from}</span>
                  <span className="mx-1.5 rounded bg-violet-100 px-1.5 py-0.5 text-xs text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
                    {r.relation}
                  </span>
                  <span className="font-medium">{r.to}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">原文</h2>
          <div className="max-h-[50svh] overflow-y-auto whitespace-pre-wrap rounded-2xl border border-zinc-200 bg-white p-4 text-sm leading-relaxed text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
            {source.rawContent}
          </div>
        </section>

        {nodeSources.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              原文片段溯源
            </h2>
            <ul className="space-y-2">
              {nodeSources.map((ns) => (
                <li
                  key={ns.id}
                  id={`node-${ns.nodeId}`}
                  className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                    {ns.node.name}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                    「{ns.excerpt}」
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
