/**
 * 图谱对齐受控重放：把指定历史库中已确认的抽取快照（Source.metadata.extractionSnapshot）
 * 按原始喂入顺序重放进当前管线（POST /api/graph/ingest，跳过 AI 抽取）。
 *
 * 用途：对齐策略 A/B 时隔离"AI 抽取抽样波动"这个混杂变量——输入完全一致，
 * 只对比对齐层的行为（裁决次数/准确率/耗时）。结果格式与 graph-stress-run.mts 一致，
 * 可直接用 graph-stress-eval.mts 评估。
 *
 * 用法：
 *   npx tsx scripts/graph-stress-replay.mts <历史库.sqlite> [输出结果文件]
 * 示例（重放压测前备份库中的 16 篇）：
 *   npx tsx scripts/graph-stress-replay.mts backups/dev-xxxx-pre-t3.db scripts/graph-stress-replay-results.json
 *
 * 注意：会先清空当前库图谱表（等价于压测前重置）；服务端走 STRESS_BASE（默认 localhost:3000）。
 */
import "dotenv/config";
import { appendFileSync } from "node:fs";
import { PrismaClient } from "../src/generated/prisma/client";

const BASE = process.env.STRESS_BASE ?? "http://localhost:3000";
const dbPath = process.argv[2];
const OUT_FILE = process.argv[3] ?? "scripts/graph-stress-replay-results.json";

if (!dbPath) {
  console.error("usage: npx tsx scripts/graph-stress-replay.mts <历史库.sqlite> [输出结果文件]");
  process.exit(1);
}

// 与 graph-stress-run.mts 同一份清单的期望（用于 eval 的准确率判定）
const EXPECTS: { entityStem: string; targetStem: string | null }[][] = [
  [],
  [
    { entityStem: "反向传播", targetStem: "反向传播" },
    { entityStem: "梯度消失", targetStem: "梯度消失" },
  ],
  [{ entityStem: "过拟合", targetStem: "过拟合" }],
  [
    { entityStem: "梯度消失", targetStem: "梯度消失" },
    { entityStem: "CNN", targetStem: "卷积神经网络" },
  ],
  [{ entityStem: "梯度消失", targetStem: "梯度消失" }],
  [{ entityStem: "LSTM", targetStem: "长短期记忆" }],
  [{ entityStem: "过拟合", targetStem: "过拟合" }],
  [{ entityStem: "BERT", targetStem: "BERT" }],
  [{ entityStem: "CNN", targetStem: "卷积神经网络" }],
  [],
  [{ entityStem: "学习率", targetStem: "学习率" }],
  [{ entityStem: "CNN", targetStem: "卷积神经网络" }],
  [],
  [],
  [],
  [],
];

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
interface Snapshot {
  domain?: string;
  entities?: SnapshotEntity[];
  relations?: SnapshotRelation[];
}

const reader = new PrismaClient({
  datasourceUrl: `file:${dbPath.replace(/\\/g, "/")}`,
});
const writer = new PrismaClient();

async function post(path: string, body: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function snapshot() {
  const res = await fetch(`${BASE}/api/graph/data`);
  const json = await res.json();
  if (json.code !== 0) throw new Error(json.msg);
  const { nodes, edges, stats } = json.data;
  const degree = new Map<string, number>();
  const pairEdges = new Map<string, number>();
  for (const e of edges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
    const pair = [e.source, e.target].sort().join("|");
    pairEdges.set(pair, (pairEdges.get(pair) ?? 0) + 1);
  }
  const isolated = nodes.filter((n: { id: string }) => !degree.get(n.id));
  return {
    stats,
    isolatedCount: isolated.length,
    isolatedNames: isolated.map((n: { name: string }) => n.name),
    maxPairEdgeCount: Math.max(0, ...pairEdges.values()),
    multiEdgePairs: [...pairEdges.values()].filter((c) => c > 1).length,
    mentionGe2: nodes.filter((n: { value: number }) => n.value >= 2).length,
    nodes: nodes.map((n: { name: string; value: number; domain: string }) => ({
      name: n.name,
      mention: n.value,
      domain: n.domain,
    })),
  };
}

async function main() {
  const sources = await reader.source.findMany({
    where: { sourceType: "text" },
    orderBy: { createdAt: "asc" },
    select: { title: true, rawContent: true, metadata: true },
  });
  await reader.$disconnect();
  const usable = sources
    .map((s, i) => ({ ...s, snapshot: (s.metadata ?? {}) as Snapshot, idx: i }))
    .filter((s) => Array.isArray(s.snapshot.entities) && s.snapshot.entities!.length > 0)
    .slice(0, 16);

  // 清空当前库图谱表（与压测前重置等价）
  const wiped = {
    edges: await writer.graphEdge.deleteMany(),
    nodeSources: await writer.nodeSource.deleteMany(),
    sources: await writer.source.deleteMany(),
    reviews: await writer.mergeReview.deleteMany(),
    nodes: await writer.graphNode.deleteMany(),
  };
  console.log("wiped:", JSON.stringify(wiped), `replay ${usable.length} sources`);

  const idToName = new Map<string, string>();
  for (let i = 0; i < usable.length; i++) {
    const s = usable[i];
    const start = Date.now();
    process.stdout.write(`[${i + 1}/${usable.length}] ${s.title} … `);
    const ir = await post("/api/graph/ingest", {
      title: s.title,
      content: s.rawContent,
      extracted: {
        domain: s.snapshot.domain ?? "其他",
        entities: s.snapshot.entities,
        relations: s.snapshot.relations ?? [],
      },
    });
    if (ir.code !== 0) {
      console.log(`入库失败: ${ir.msg}`);
      appendFileSync(
        OUT_FILE,
        JSON.stringify({ seq: i + 1, title: s.title, error: ir.msg }) + "\n"
      );
      continue;
    }
    const r = ir.data;
    const dataJson = await (await fetch(`${BASE}/api/graph/data`)).json();
    for (const n of dataJson.data.nodes) idToName.set(n.id, n.name);

    appendFileSync(
      OUT_FILE,
      JSON.stringify({
        seq: i + 1,
        key: `replay-${s.idx + 1}`,
        title: s.title,
        domain: s.snapshot.domain,
        entities: s.snapshot.entities!.map((e) => e.name),
        relations: (s.snapshot.relations ?? []).map(
          (x) => `${x.from}|${x.relation}|${x.to}`
        ),
        newNodes: r.newNodes,
        reusedNodes: r.reusedNodes,
        newEdges: r.newEdges,
        incrementedEdges: r.incrementedEdges,
        conflicts: r.conflicts,
        skippedRelations: r.skippedRelations,
        elapsedMs: Date.now() - start,
        alignments: r.alignments.map(
          (a: { name: string; matched: string | null; reason: string }) => ({
            name: a.name,
            matchedId: a.matched,
            matchedName: a.matched ? idToName.get(a.matched) ?? "?" : null,
            reason: a.reason,
          })
        ),
        expect: EXPECTS[i] ?? [],
      }) + "\n"
    );
    console.log(`+${r.newNodes} 新 / ${r.reusedNodes} 复用（${Date.now() - start}ms）`);

    if ((i + 1) % 4 === 0) {
      const snap = await snapshot();
      appendFileSync(
        OUT_FILE,
        JSON.stringify({ checkpoint: i + 1, ...snap }) + "\n"
      );
      console.log(`  ▓ 快照@${i + 1}: 节点${snap.stats.nodeCount} 边${snap.stats.edgeCount}`);
    }
  }
  await writer.$disconnect();
  console.log("done");
}

main().catch((err) => {
  console.error("replay failed:", err);
  process.exit(1);
});
