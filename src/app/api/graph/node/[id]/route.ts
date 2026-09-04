import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

function bad(msg: string, status = 400) {
  return NextResponse.json({ code: status, data: null, msg }, { status });
}

/** 节点详情（抽屉用）：基本信息 + 关联边（含邻居名）+ 来源溯源 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const node = await prisma.graphNode.findUnique({ where: { id } });
    if (!node) {
      return bad("节点不存在", 404);
    }

    const edges = await prisma.graphEdge.findMany({
      where: { OR: [{ fromNodeId: id }, { toNodeId: id }] },
      include: {
        fromNode: { select: { id: true, name: true } },
        toNode: { select: { id: true, name: true } },
      },
      orderBy: { weight: "desc" },
    });

    const sources = await prisma.nodeSource.findMany({
      where: { nodeId: id },
      include: { source: { select: { id: true, title: true, createdAt: true } } },
      orderBy: { source: { createdAt: "desc" as const } },
    });

    return NextResponse.json({
      code: 0,
      data: {
        id: node.id,
        name: node.name,
        aliases: Array.isArray(node.aliases)
          ? node.aliases.filter((a): a is string => typeof a === "string")
          : [],
        domain: node.domain,
        summary: node.summary,
        mentionCount: node.mentionCount,
        relations: edges.map((e) => ({
          direction: e.fromNodeId === id ? "out" : "in",
          relation: e.relation,
          weight: e.weight,
          neighborId: e.fromNodeId === id ? e.toNodeId : e.fromNodeId,
          neighborName:
            e.fromNodeId === id ? e.toNode.name : e.fromNode.name,
        })),
        sources: sources.map((ns) => ({
          sourceId: ns.source.id,
          title: ns.source.title,
          excerpt: ns.excerpt,
        })),
      },
      msg: "",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[graph/node] failed:", message);
    return bad(message, 500);
  }
}
