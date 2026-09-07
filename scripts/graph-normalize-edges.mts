/**
 * 一次性存量清理：把已有 GraphEdge 按 normalizeRelation 归一（同义动词映射 + 互逆方向归一），
 * 归一后同三元组（from+to+relation）的边合并为一条（weight 相加，保留最早创建）。
 * 用法：npx tsx scripts/graph-normalize-edges.mts
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";
import type { Prisma } from "../src/generated/prisma/client";
import { normalizeRelation } from "../src/modules/graph/extract";

/** 非关系噪音词（与 parseExtraction 的 NOISE_RELATIONS 对应），存量直接删除 */
const NOISE_RELATIONS = new Set(["与", "相比", "示例", "相关", "有关", "以及", "和", "或"]);

async function main() {
  const edges = await prisma.graphEdge.findMany({
    orderBy: { createdAt: "asc" },
  });
  const nodes = await prisma.graphNode.findMany({ select: { id: true, name: true } });
  const nameById = new Map(nodes.map((n) => [n.id, n.name]));

  // 噪音边直接删除
  const noiseEdges = edges.filter((e) => NOISE_RELATIONS.has(e.relation));
  if (noiseEdges.length > 0) {
    await prisma.graphEdge.deleteMany({ where: { id: { in: noiseEdges.map((e) => e.id) } } });
    console.log(`删除噪音边 ${noiseEdges.length} 条：`);
    for (const e of noiseEdges) {
      console.log(`  ${nameById.get(e.fromNodeId)} —${e.relation}→ ${nameById.get(e.toNodeId)}`);
    }
  }
  const remaining = edges.filter((e) => !NOISE_RELATIONS.has(e.relation));

  // 计算每条边的归一目标三元组
  const targetByEdgeId = new Map<string, { from: string; to: string; relation: string }>();
  for (const e of remaining) {
    let norm = normalizeRelation({ from: e.fromNodeId, relation: e.relation, to: e.toNodeId });
    if (norm.from === norm.to) {
      // 归一后成自环（理论上罕见），保留原方向不参与归并
      norm = { from: e.fromNodeId, relation: e.relation, to: e.toNodeId };
    }
    targetByEdgeId.set(e.id, norm);
  }

  // 按目标三元组分组（组内 >1 才需要合并）
  const groups = new Map<string, typeof edges>();
  for (const e of remaining) {
    const t = targetByEdgeId.get(e.id)!;
    const key = `${t.from}|${t.to}|${t.relation}`;
    const list = groups.get(key) ?? [];
    list.push(e);
    groups.set(key, list);
  }

  const merges: { kept: string; removed: string[]; weight: number }[] = [];
  const reorients: string[] = [];
  const ops: Prisma.PrismaPromise<unknown>[] = [];

  for (const list of groups.values()) {
    if (list.length === 1) {
      // 单条边但归一后方向/动词与现库不同：原地改写为归一形态，保证后续入库可去重
      const e = list[0];
      const t = targetByEdgeId.get(e.id)!;
      if (t.from !== e.fromNodeId || t.to !== e.toNodeId || t.relation !== e.relation) {
        ops.push(
          prisma.graphEdge.update({
            where: { id: e.id },
            data: { fromNodeId: t.from, toNodeId: t.to, relation: t.relation },
          })
        );
        reorients.push(
          `${nameById.get(e.fromNodeId)} —${e.relation}→ ${nameById.get(e.toNodeId)}  改为  ${nameById.get(t.from)} —${t.relation}→ ${nameById.get(t.to)}`
        );
      }
      continue;
    }
    const [keeper, ...dupes] = list; // findMany 已按 createdAt 升序，首条即最早
    const totalWeight = list.reduce((s, e) => s + e.weight, 0);
    ops.push(
      prisma.graphEdge.update({ where: { id: keeper.id }, data: { weight: totalWeight } }),
      ...dupes.map((d) => prisma.graphEdge.delete({ where: { id: d.id } }))
    );
    merges.push({
      kept: `${nameById.get(keeper.fromNodeId)} —${targetByEdgeId.get(keeper.id)!.relation}→ ${nameById.get(keeper.toNodeId)}`,
      removed: dupes.map(
        (d) => `${nameById.get(d.fromNodeId)} —${d.relation}→ ${nameById.get(d.toNodeId)} (w=${d.weight})`
      ),
      weight: totalWeight,
    });
  }

  await prisma.$transaction(ops);

  const after = await prisma.graphEdge.count();
  console.log(`归并前 ${remaining.length} 条边，归并后 ${after} 条，合并 ${merges.length} 组，改写方向 ${reorients.length} 条`);
  for (const r of reorients) console.log(`  改写: ${r}`);
  for (const m of merges) {
    console.log(`  保留: ${m.kept} (weight=${m.weight})`);
    for (const r of m.removed) console.log(`    并入: ${r}`);
  }
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
