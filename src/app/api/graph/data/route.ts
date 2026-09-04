import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

function bad(msg: string, status = 400) {
  return NextResponse.json({ code: status, data: null, msg }, { status });
}

/**
 * 图谱数据：节点大小按 mentionCount 映射 20-60，边权重供线宽使用。
 * 临时性能策略：节点总数超过 200 时，只返回 mentionCount >= 2 的节点及其边，
 * 避免力导向图在大图上卡顿；后续可换成按 domain/权重检索或分页聚类。
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const domain = url.searchParams.get("domain")?.trim() || undefined;

    const where = domain ? { domain } : {};
    const totalNodes = await prisma.graphNode.count({ where });
    const mentionThreshold = totalNodes > 200 ? 2 : 0;

    const nodes = (
      await prisma.graphNode.findMany({
        where: { ...where, mentionCount: { gte: mentionThreshold } },
        select: { id: true, name: true, mentionCount: true, domain: true },
        orderBy: { mentionCount: "desc" },
      })
    ).map((n) => ({
      id: n.id,
      name: n.name,
      value: n.mentionCount,
      domain: n.domain,
      symbolSize: 20 + Math.min(40, (n.mentionCount - 1) * 6),
    }));

    const nodeIds = new Set(nodes.map((n) => n.id));
    const edges = (
      await prisma.graphEdge.findMany({
        select: {
          fromNodeId: true,
          toNodeId: true,
          relation: true,
          weight: true,
        },
      })
    )
      .filter((e) => nodeIds.has(e.fromNodeId) && nodeIds.has(e.toNodeId))
      .map((e) => ({
        source: e.fromNodeId,
        target: e.toNodeId,
        label: e.relation,
        value: e.weight,
      }));

    const domains = await prisma.graphNode.groupBy({
      by: ["domain"],
      _count: { _all: true },
    });

    return NextResponse.json({
      code: 0,
      data: {
        nodes,
        edges,
        stats: {
          nodeCount: totalNodes,
          edgeCount: await prisma.graphEdge.count(),
          sourceCount: await prisma.source.count(),
          domains: domains
            .map((d) => ({ name: d.domain, count: d._count._all }))
            .sort((a, b) => b.count - a.count),
        },
        truncated: mentionThreshold > 0,
      },
      msg: "",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[graph/data] failed:", message);
    return bad(message, 500);
  }
}
