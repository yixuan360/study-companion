/** 冲突机制测试：从压测结果中找一条「抑制」关系，构造语义相反的对比文章喂入 */
import { readFileSync } from "node:fs";

const BASE = "http://localhost:3000";
const records = readFileSync("scripts/graph-stress-results.json", "utf8")
  .trim()
  .split("\n")
  .map((l) => JSON.parse(l));

const target = records.find(
  (r) => r.relations?.some((x: string) => x.split("|")[1] === "抑制")
);
if (!target) {
  console.log("no 抑制 relation found, skip");
  process.exit(0);
}
const rel = target.relations.find((x: string) => x.split("|")[1] === "抑制").split("|");
const [fromName, , toName] = rel;
console.log(`基于已有关系: ${fromName} --抑制--> ${toName}（来自《${target.title}》）`);

const payload = {
  title: "冲突机制测试文",
  content: `有研究指出，在某些配置下${fromName}反而会${toName === "过拟合" ? "加剧过拟合" : "产生负面效果"}，即${fromName}导致${toName}，这与主流观点相反。`,
  extracted: {
    domain: target.domain,
    entities: [
      { name: fromName, aliases: [], summary: "（冲突测试实体）" },
      { name: toName, aliases: [], summary: "（冲突测试实体）" },
    ],
    relations: [
      {
        from: fromName,
        relation: "导致",
        to: toName,
        evidence: "冲突机制测试：构造与已有「抑制」关系相反的「导致」关系",
      },
    ],
  },
};

const res = await fetch(`${BASE}/api/graph/ingest`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});
const json = await res.json();
if (json.code !== 0) {
  console.log("ingest failed:", json.msg);
  process.exit(1);
}
console.log({
  newNodes: json.data.newNodes,
  reusedNodes: json.data.reusedNodes,
  newEdges: json.data.newEdges,
  conflicts: json.data.conflicts,
  alignments: json.data.alignments.map((a: { name: string; matchedName: string | null }) => `${a.name}→${a.matchedName ?? "新建"}`),
});
