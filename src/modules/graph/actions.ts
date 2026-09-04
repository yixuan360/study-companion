"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

/** 来源状态汇总（供列表页展示） */
export async function getSourceSummaries() {
  const sources = await prisma.source.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { nodeSources: true } } },
  });
  return sources.map((s) => ({
    id: s.id,
    title: s.title,
    createdAt: s.createdAt,
    nodeCount: s._count.nodeSources,
  }));
}

/**
 * 删除来源：级联删除 NodeSource；节点与边保守保留（其他来源可能也提到），
 * mentionCount 相应 -1，降到 0 的节点在 metadata 标记 pendingCleanup（待清理，不自动删）。
 */
export async function deleteSourceAction(sourceId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const nodeSources = await tx.nodeSource.findMany({
      where: { sourceId },
      select: { nodeId: true },
    });

    await tx.source.delete({ where: { id: sourceId } });

    for (const { nodeId } of nodeSources) {
      const node = await tx.graphNode.update({
        where: { id: nodeId },
        data: { mentionCount: { decrement: 1 } },
        select: { mentionCount: true, metadata: true },
      });
      if (node.mentionCount <= 0) {
        const meta =
          typeof node.metadata === "object" && node.metadata !== null
            ? (node.metadata as Record<string, unknown>)
            : {};
        await tx.graphNode.update({
          where: { id: nodeId },
          data: {
            mentionCount: 0,
            metadata: { ...meta, pendingCleanup: true },
          },
        });
      }
    }
  });

  revalidatePath("/graph/sources");
  revalidatePath("/graph");
}

export type ReviewResolution = "keepOld" | "takeNew" | "keepBoth";

/**
 * 处理冲突审阅：
 * - keepOld 保留旧关系：删除新边，status=rejected
 * - takeNew  采用新关系：删除旧边，status=approved
 * - keepBoth 两者共存：不动边，status=approved + 备注
 */
export async function resolveReviewAction(
  reviewId: string,
  resolution: ReviewResolution,
  note?: string
): Promise<void> {
  const review = await prisma.mergeReview.findUnique({ where: { id: reviewId } });
  if (!review || review.status !== "pending") {
    throw new Error("审阅记录不存在或已处理");
  }
  const payload = review.payload as {
    existingEdgeId?: string | null;
    incomingEdgeId?: string | null;
  };

  await prisma.$transaction(async (tx) => {
    if (resolution === "keepOld" && payload.incomingEdgeId) {
      await tx.graphEdge.deleteMany({ where: { id: payload.incomingEdgeId } });
    }
    if (resolution === "takeNew" && payload.existingEdgeId) {
      await tx.graphEdge.deleteMany({ where: { id: payload.existingEdgeId } });
    }
    await tx.mergeReview.update({
      where: { id: reviewId },
      data: {
        status: resolution === "keepOld" ? "rejected" : "approved",
        metadata: { resolution, note: note?.trim() || null },
      },
    });
  });

  revalidatePath("/graph/review");
}
