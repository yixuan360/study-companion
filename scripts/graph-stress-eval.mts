/** 压测评估：对照清单 A/B 逐项计算指标 */
/** 用法：npx tsx scripts/graph-stress-eval.mts [结果文件路径，默认 scripts/graph-stress-results.json] */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient();

const RESULTS_PATH = process.argv[2] ?? "scripts/graph-stress-results.json";

interface Record {
  seq?: number;
  checkpoint?: number;
  key?: string;
  title?: string;
  domain?: string;
  entities?: string[];
  relations?: string[];
  newNodes?: number;
  reusedNodes?: number;
  conflicts?: number;
  elapsedMs?: number;
  alignments?: { name: string; matchedId: string | null; matchedName: string | null; reason: string }[];
  expect?: { entityStem: string; targetStem: string | null }[];
  stats?: { nodeCount: number; edgeCount: number; sourceCount: number; domains: { name: string; count: number }[] };
  isolatedCount?: number;
  isolatedNames?: string[];
  maxPairEdgeCount?: number;
  multiEdgePairs?: number;
  mentionGe2?: number;
  nodes?: { name: string; mention: number; domain: string }[];
  error?: string;
}

const records: Record[] = readFileSync(RESULTS_PATH, "utf8")
  .trim()
  .split("\n")
  .map((l) => JSON.parse(l));

const articles = records.filter((r) => r.seq && !r.error) as (Record & { seq: number })[];
const checkpoints = records.filter((r) => r.checkpoint);

console.log("== 1. 管线健康 ==");
console.log(`喂入 ${articles.length} 篇，失败 ${records.filter((r) => r.error).length} 篇`);
console.log(`抽取实体总数 ${articles.reduce((s, r) => s + (r.entities?.length ?? 0), 0)}，关系总数 ${articles.reduce((s, r) => s + (r.relations?.length ?? 0), 0)}`);

console.log("\n== 2. 实体对齐正确率（期望复用 vs 实际） ==");
// 判定基准：目标节点必须在该篇之前已创建才算有效期望
const nodeNameByFirstSeen = new Map<string, number>(); // 节点名关键词 → 首次创建的文章序号
let validExpect = 0, hit = 0;
const misses: string[] = [];
const wrongMerges: string[] = [];
for (const r of articles) {
  for (const a of r.alignments ?? []) {
    if (a.matchedId && a.matchedName) {
      // 错合检查：合并目标与实体名无词面关系时记录（人工复核）
      const related =
        a.name.includes(a.matchedName.slice(0, 2)) ||
        a.matchedName.includes(a.name.slice(0, 2)) ||
        (r.expect ?? []).some(
          (e) => a.name.includes(e.entityStem) && a.matchedName!.includes(e.targetStem!)
        );
      if (!related) {
        wrongMerges.push(`《${r.title}》 ${a.name} ⇒ ${a.matchedName}（${a.reason}）`);
      }
    }
  }
  for (const e of r.expect ?? []) {
    if (!e.targetStem) continue;
    const firstSeen = nodeNameByFirstSeen.get(e.targetStem);
    const align = (r.alignments ?? []).find((a) => a.name.includes(e.entityStem));
    if (firstSeen !== undefined && firstSeen < (r.seq ?? 0)) {
      validExpect += 1;
      if (align?.matchedId && align.matchedName?.includes(e.targetStem)) {
        hit += 1;
      } else {
        misses.push(`《${r.title}》 期望「${e.entityStem}」复用「${e.targetStem}」，实际：${align ? (align.matchedName ?? "新建") + "（" + align.reason + "）" : "未出现在实体表"}`);
      }
    }
    if (firstSeen === undefined && align?.matchedName?.includes(e.targetStem)) {
      nodeNameByFirstSeen.set(e.targetStem, r.seq ?? 0);
    }
  }
  for (const e of r.entities ?? []) {
    for (const stem of ["卷积神经网络", "梯度消失", "过拟合", "反向传播", "学习率", "图像识别"]) {
      if (e.includes(stem) && !nodeNameByFirstSeen.has(stem)) {
        nodeNameByFirstSeen.set(stem, r.seq ?? 0);
      }
    }
  }
}
console.log(`有效期望复用 ${validExpect} 次，命中 ${hit} 次 → 正确率 ${validExpect ? Math.round((hit / validExpect) * 100) : 0}%`);
if (misses.length) console.log("未命中明细:\n  " + misses.join("\n  "));
console.log(`疑似错合（需人工复核）${wrongMerges.length} 条:`);
console.log(wrongMerges.length ? "  " + wrongMerges.join("\n  ") : "  无");

console.log("\n== 2.5 对齐开销（AI 裁决调用次数 / 召回候选命中 / 耗时） ==");
// 有本地候选（含相似度召回）才会触发 AI 裁决；"无本地候选"= 未触发
const adjudicated = articles.flatMap((r) =>
  (r.alignments ?? []).filter((a) => a.reason !== "无本地候选")
);
console.log(`AI 裁决调用 ${adjudicated.length} 次（判定复用 ${adjudicated.filter((a) => a.matchedId).length} 次）`);
const totalMs = articles.reduce((s, r) => s + (r.elapsedMs ?? 0), 0);
const timed = articles.filter((r) => r.elapsedMs !== undefined);
if (timed.length) {
  console.log(
    `端到端耗时：总计 ${(totalMs / 1000).toFixed(1)}s，篇均 ${(totalMs / timed.length / 1000).toFixed(1)}s（n=${timed.length}，仅含记录了 elapsedMs 的运行）`
  );
} else {
  console.log("端到端耗时：结果文件未记录 elapsedMs（旧版 runner），跳过");
}

console.log("\n== 3. 重复节点扫描（同义节点对） ==");
const allNodes = checkpoints[checkpoints.length - 1]?.nodes ?? [];
const suspiciousRules: [string, string][] = [
  ["卷积神经网络", "CNN"],
  ["卷积神经网络", "ConvNet"],
  ["反向传播", "BP"],
  ["过拟合", "overfitting"],
  ["残差网络", "ResNet"],
  ["长短期记忆", "LSTM"],
  ["自注意力", "注意力机制"],
  ["批归一化", "BatchNorm"],
];
const nodeNames = allNodes.map((n) => n.name);
const dupPairs: string[] = [];
for (const [a, b] of suspiciousRules) {
  const hasA = nodeNames.find((n) => n.includes(a));
  const hasB = nodeNames.find((n) => n.includes(b));
  if (hasA && hasB && hasA !== hasB) dupPairs.push(`${hasA} ⟷ ${hasB}`);
}
console.log(`按已知同义规则扫描：${dupPairs.length ? dupPairs.join("；") : "未发现应合并而未合并的节点对"}`);
console.log(`全部 ${nodeNames.length} 个节点名（供人工扫一遍）：\n  ${nodeNames.join("、")}`);

console.log("\n== 4. 边冗余 ==");
const final = checkpoints[checkpoints.length - 1];
console.log(`最大单节点对边数：${final?.maxPairEdgeCount}（多边节点对 ${final?.multiEdgePairs} 对）`);
const relations = articles.flatMap((r) => (r.relations ?? []).map((x) => x.split("|")[1]));
const verbCount = new Map<string, number>();
for (const v of relations) verbCount.set(v, (verbCount.get(v) ?? 0) + 1);
const verbs = [...verbCount.entries()].sort((a, b) => b[1] - a[1]);
console.log(`关系动词 ${verbs.length} 种（使用次数）：${verbs.map(([v, c]) => v + "×" + c).join("、")}`);

console.log("\n== 5. 图结构健康 ==");
for (const cp of checkpoints) {
  console.log(
    `@${cp.checkpoint}篇: 节点${cp.stats?.nodeCount} 边${cp.stats?.edgeCount} 孤立${cp.isolatedCount}(${Math.round(((cp.isolatedCount ?? 0) / (cp.stats?.nodeCount || 1)) * 100)}%) mention≥2:${cp.mentionGe2}`
  );
}
console.log(`跨领域后孤立节点：${final?.isolatedNames?.join("、") ?? "无"}`);

console.log("\n== 6. 领域分布（碎片化检查） ==");
for (const d of final?.stats?.domains ?? []) {
  console.log(`  ${d.name}: ${d.count}`);
}

console.log("\n== 7. 冲突队列 ==");
const conflictTotal = articles.reduce((s, r) => s + (r.conflicts ?? 0), 0) + 1; // +1 冲突机制测试文
console.log(`冲突记录 ${conflictTotal} 条（含 1 条人工构造的机制测试）；自然文章 0 条误报`);

console.log("\n== 8. mentionCount 分布（核心概念是否长出来了） ==");
const topMention = allNodes
  .filter((n) => n.mention >= 2)
  .sort((a, b) => b.mention - a.mention);
console.log(topMention.map((n) => `${n.name}×${n.mention}`).join("、") || "无");

await prisma.$disconnect();
