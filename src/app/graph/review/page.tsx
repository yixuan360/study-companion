import { prisma } from "@/lib/db";
import { BackLink } from "@/app/_components/BackLink";
import { GraphTabs } from "../_components/GraphTabs";
import { ReviewList } from "./ReviewList";

function formatDate(d: Date): string {
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

interface ConflictPayload {
  sourceId?: string;
  sourceTitle?: string;
  fromName?: string;
  toName?: string;
  existingRelation?: string;
  incomingRelation?: string;
  incomingExcerpt?: string;
}

export default async function GraphReviewPage() {
  const [pending, resolvedCount] = await Promise.all([
    prisma.mergeReview.findMany({
      where: { status: "pending", type: "conflict" },
      orderBy: { createdAt: "desc" },
    }),
    prisma.mergeReview.count({ where: { status: { not: "pending" } } }),
  ]);

  const items = pending.map((r) => {
    const p = (r.payload ?? {}) as ConflictPayload;
    return {
      id: r.id,
      createdAtLabel: formatDate(r.createdAt),
      fromName: p.fromName ?? "？",
      toName: p.toName ?? "？",
      existingRelation: p.existingRelation ?? "？",
      incomingRelation: p.incomingRelation ?? "？",
      incomingExcerpt: p.incomingExcerpt ?? "",
      sourceTitle: p.sourceTitle ?? "",
      sourceId: p.sourceId ?? "",
    };
  });

  return (
    <main className="min-h-svh bg-zinc-50 px-4 py-6 pb-24 sm:px-6 sm:pb-6 dark:bg-black">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6">
          <BackLink href="/graph">返回图谱</BackLink>
        </div>
        <GraphTabs />

        <h1 className="mb-1 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          变更审阅
        </h1>
        <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
          待处理 {items.length} 条 · 已处理 {resolvedCount} 条。
          冲突指同一对知识点出现了语义相反的关系（如「导致」vs「抑制」）
        </p>

        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center dark:border-zinc-700 dark:bg-zinc-900">
            <div className="mb-2 text-4xl">✅</div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              没有待处理的冲突，图谱合并一切正常
            </p>
          </div>
        ) : (
          <ReviewList items={items} />
        )}
      </div>
    </main>
  );
}
