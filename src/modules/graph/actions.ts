"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

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
            metadata: {
              ...meta,
              pendingCleanup: true,
              pendingCleanupAt: new Date().toISOString(),
            },
          },
        });
      }
    }
  });

  revalidatePath("/graph/sources");
  revalidatePath("/graph/cleanup");
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

// ---------------- pendingCleanup 清理页 ----------------

function readMetadataRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((s): s is string => typeof s === "string")
    : [];
}

/** 确认删除待清理节点：边与 NodeSource 由外键级联清除（GraphEdge/NodeSource 均 onDelete: Cascade） */
export async function deleteCleanupNode(nodeId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const node = await tx.graphNode.findUnique({
      where: { id: nodeId },
      select: { metadata: true },
    });
    if (!node || readMetadataRecord(node.metadata).pendingCleanup !== true) {
      throw new Error("节点不在待清理状态");
    }
    await tx.graphNode.delete({ where: { id: nodeId } });
  });
}

/**
 * 恢复待清理节点：撤销 pendingCleanup 标记，提及次数重置为 1
 * （节点重新作为有效概念存活；被删来源的提及已不可追溯，从 1 重新开始计）。
 */
export async function restoreCleanupNode(nodeId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const node = await tx.graphNode.findUnique({
      where: { id: nodeId },
      select: { metadata: true },
    });
    const meta = { ...readMetadataRecord(node?.metadata) };
    if (node === null || meta.pendingCleanup !== true) {
      throw new Error("节点不在待清理状态");
    }
    delete meta.pendingCleanup;
    delete meta.pendingCleanupAt;
    await tx.graphNode.update({
      where: { id: nodeId },
      data: { mentionCount: 1, metadata: meta as Prisma.InputJsonValue },
    });
  });
}

export async function deleteCleanupNodeAction(nodeId: string): Promise<void> {
  await deleteCleanupNode(nodeId);
  revalidatePath("/graph/cleanup");
  revalidatePath("/graph");
}

export async function restoreCleanupNodeAction(nodeId: string): Promise<void> {
  await restoreCleanupNode(nodeId);
  revalidatePath("/graph/cleanup");
  revalidatePath("/graph");
}

// ---------------- align 待审裁决 ----------------

export type AlignResolution = "approve" | "reject";

interface AlignPayload {
  newNodeId?: string | null;
  entityName?: string;
  entityAliases?: string[];
  suggestedNodeId?: string;
}

/** 把 fromId 的出边/入边并入 toId：同三元组（from+relation+to）累加 weight，自环删除 */
async function migrateNodeEdges(
  tx: Pick<Prisma.TransactionClient, "graphEdge">,
  fromId: string,
  toId: string
): Promise<void> {
  const outs = await tx.graphEdge.findMany({ where: { fromNodeId: fromId } });
  for (const e of outs) {
    if (e.toNodeId === fromId) {
      await tx.graphEdge.delete({ where: { id: e.id } });
      continue;
    }
    const dup = await tx.graphEdge.findUnique({
      where: {
        fromNodeId_toNodeId_relation: {
          fromNodeId: toId,
          toNodeId: e.toNodeId,
          relation: e.relation,
        },
      },
    });
    if (dup) {
      await tx.graphEdge.update({
        where: { id: dup.id },
        data: { weight: { increment: e.weight } },
      });
      await tx.graphEdge.delete({ where: { id: e.id } });
    } else {
      await tx.graphEdge.update({
        where: { id: e.id },
        data: { fromNodeId: toId },
      });
    }
  }
  const ins = await tx.graphEdge.findMany({ where: { toNodeId: fromId } });
  for (const e of ins) {
    if (e.fromNodeId === fromId) {
      await tx.graphEdge.delete({ where: { id: e.id } });
      continue;
    }
    const dup = await tx.graphEdge.findUnique({
      where: {
        fromNodeId_toNodeId_relation: {
          fromNodeId: e.fromNodeId,
          toNodeId: toId,
          relation: e.relation,
        },
      },
    });
    if (dup) {
      await tx.graphEdge.update({
        where: { id: dup.id },
        data: { weight: { increment: e.weight } },
      });
      await tx.graphEdge.delete({ where: { id: e.id } });
    } else {
      await tx.graphEdge.update({
        where: { id: e.id },
        data: { toNodeId: toId },
      });
    }
  }
}

/**
 * 批准 align 合并：执行与自动合并一致的复用逻辑——
 * 目标节点 mentionCount+1、别名并集≤20（主名不变）；新建节点的边（同三元组 weight 累加）
 * 与 NodeSource 溯源迁移到目标节点后删除新建节点（残余级联）。
 */
export async function approveAlignMerge(reviewId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const review = await tx.mergeReview.findUnique({ where: { id: reviewId } });
    if (
      !review ||
      review.status !== "pending" ||
      review.type !== "align"
    ) {
      throw new Error("审阅记录不存在或已处理");
    }
    const payload = (review.payload ?? {}) as AlignPayload;
    const target = payload.suggestedNodeId
      ? await tx.graphNode.findUnique({
          where: { id: payload.suggestedNodeId },
          select: { id: true, name: true, aliases: true },
        })
      : null;
    if (!target) throw new Error("建议并入的节点不存在");
    const source = payload.newNodeId
      ? await tx.graphNode.findUnique({
          where: { id: payload.newNodeId },
          select: { id: true, name: true, aliases: true },
        })
      : null;

    // 别名并集≤20、主名不变（复刻 ingest 自动合并逻辑；新建节点已删时退回实体快照）
    const mergedAliases = [
      ...new Set(
        [
          ...readStringArray(target.aliases),
          target.name,
          ...(source
            ? [source.name, ...readStringArray(source.aliases)]
            : [payload.entityName ?? "", ...(payload.entityAliases ?? [])]),
        ].filter((a) => a.trim() && a !== target.name)
      ),
    ].slice(0, 20);

    if (source && source.id !== target.id) {
      await migrateNodeEdges(tx, source.id, target.id);
      const nodeSources = await tx.nodeSource.findMany({
        where: { nodeId: source.id },
      });
      for (const ns of nodeSources) {
        await tx.nodeSource.upsert({
          where: {
            nodeId_sourceId: { nodeId: target.id, sourceId: ns.sourceId },
          },
          create: { nodeId: target.id, sourceId: ns.sourceId, excerpt: ns.excerpt },
          update: {},
        });
      }
      await tx.graphNode.delete({ where: { id: source.id } });
    }

    await tx.graphNode.update({
      where: { id: target.id },
      data: { mentionCount: { increment: 1 }, aliases: mergedAliases },
    });
    await tx.mergeReview.update({
      where: { id: reviewId },
      data: { status: "approved", metadata: { resolution: "approve" } },
    });
  });
}

/** 拒绝 align 合并：维持新建节点，各自独立 */
export async function rejectAlignMerge(
  reviewId: string,
  note?: string
): Promise<void> {
  const review = await prisma.mergeReview.findUnique({ where: { id: reviewId } });
  if (!review || review.status !== "pending" || review.type !== "align") {
    throw new Error("审阅记录不存在或已处理");
  }
  await prisma.mergeReview.update({
    where: { id: reviewId },
    data: {
      status: "rejected",
      metadata: { resolution: "reject", note: note?.trim() || null },
    },
  });
}

export async function resolveAlignReviewAction(
  reviewId: string,
  resolution: AlignResolution,
  note?: string
): Promise<void> {
  if (resolution === "approve") {
    await approveAlignMerge(reviewId);
  } else {
    await rejectAlignMerge(reviewId, note);
  }
  revalidatePath("/graph/review");
  revalidatePath("/graph");
}
