import { prisma } from "@/lib/db";
import { BackLink } from "@/app/_components/BackLink";
import { GraphTabs } from "../_components/GraphTabs";
import { ReviewList } from "./ReviewList";
import { AlignReviewList, type AlignReviewItem } from "./AlignReviewList";

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

interface AlignPayload {
  sourceId?: string;
  sourceTitle?: string;
  entityName?: string;
  entitySummary?: string;
  entityAliases?: string[];
  suggestedName?: string;
  aiReason?: string;
}

export default async function GraphReviewPage() {
  const [alignPending, conflictPending, resolvedCount] = await Promise.all([
    prisma.mergeReview.findMany({
      where: { status: "pending", type: "align" },
      orderBy: { createdAt: "desc" },
    }),
    prisma.mergeReview.findMany({
      where: { status: "pending", type: "conflict" },
      orderBy: { createdAt: "desc" },
    }),
    prisma.mergeReview.count({ where: { status: { not: "pending" } } }),
  ]);

  const alignItems: AlignReviewItem[] = alignPending.map((r) => {
    const p = (r.payload ?? {}) as AlignPayload;
    return {
      id: r.id,
      createdAtLabel: formatDate(r.createdAt),
      entityName: p.entityName ?? "？",
      entitySummary: p.entitySummary ?? "",
      entityAliases: p.entityAliases ?? [],
      suggestedName: p.suggestedName ?? "？",
      aiReason: p.aiReason ?? "",
      sourceTitle: p.sourceTitle ?? "",
      sourceId: p.sourceId ?? "",
    };
  });

  const conflictItems = conflictPending.map((r) => {
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
          待处理 {alignItems.length + conflictItems.length} 条（合并存疑{" "}
          {alignItems.length} · 关系冲突 {conflictItems.length}）· 已处理{" "}
          {resolvedCount} 条
        </p>

        {alignItems.length === 0 && conflictItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center dark:border-zinc-700 dark:bg-zinc-900">
            <div className="mb-2 text-4xl">✅</div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              没有待处理的审阅，图谱合并一切正常
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {alignItems.length > 0 && (
              <section>
                <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                  🤔 合并存疑（AI 不确定或人机分歧，需人工确认）
                </h2>
                <AlignReviewList items={alignItems} />
              </section>
            )}
            {conflictItems.length > 0 && (
              <section>
                <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                  ⚡ 关系冲突（同一对知识点出现语义相反的关系）
                </h2>
                <ReviewList items={conflictItems} />
              </section>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
