/**
 * 一次性存量清理：把 GraphNode.domain 按 normalizeDomain 归一到领域词表（extract.ts DOMAIN_VOCABULARY），
 * 同时归一 Source.metadata.domain 快照（来源详情页展示用）。
 * 用法：
 *   npx tsx scripts/graph-normalize-domains.mts --dry-run   # 只打印变更清单，不写库
 *   npx tsx scripts/graph-normalize-domains.mts             # 实跑写入
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";
import type { Prisma } from "../src/generated/prisma/client";
import { normalizeDomain } from "../src/modules/graph/extract";

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const nodes = await prisma.graphNode.findMany({
    select: { id: true, name: true, domain: true },
    orderBy: { createdAt: "asc" },
  });

  const nodeChanges = nodes
    .map((n) => ({ ...n, next: normalizeDomain(n.domain) }))
    .filter((n) => n.next !== n.domain);

  console.log(`节点 domain 归一：${nodes.length} 个节点，${nodeChanges.length} 个需要变更`);
  for (const c of nodeChanges) {
    console.log(`  ${c.id} ${c.name}: ${c.domain} → ${c.next}`);
  }

  // 来源详情页的"领域"展示读 Source.metadata.domain 快照，一并归一保持展示一致
  const sources = await prisma.source.findMany({ select: { id: true, title: true, metadata: true } });
  const sourceChanges: {
    id: string;
    title: string;
    from: string;
    to: string;
    metadata: Prisma.InputJsonValue;
  }[] = [];
  for (const s of sources) {
    const meta = (s.metadata ?? {}) as Record<string, unknown>;
    if (typeof meta.domain !== "string") continue;
    const next = normalizeDomain(meta.domain);
    if (next === meta.domain) continue;
    sourceChanges.push({
      id: s.id,
      title: s.title,
      from: meta.domain,
      to: next,
      metadata: { ...meta, domain: next } as Prisma.InputJsonValue,
    });
  }

  console.log(`来源快照 domain 归一：${sources.length} 个来源，${sourceChanges.length} 个需要变更`);
  for (const c of sourceChanges) {
    console.log(`  ${c.id} ${c.title}: ${c.from} → ${c.to}`);
  }

  if (dryRun) {
    console.log("--dry-run：未写入任何变更");
  } else {
    await prisma.$transaction([
      ...nodeChanges.map((c) =>
        prisma.graphNode.update({ where: { id: c.id }, data: { domain: c.next } })
      ),
      ...sourceChanges.map((c) =>
        prisma.source.update({ where: { id: c.id }, data: { metadata: c.metadata } })
      ),
    ]);
    console.log(`已写入：更新节点 ${nodeChanges.length} 个，来源快照 ${sourceChanges.length} 个`);
  }

  const distinct = await prisma.$queryRawUnsafe<Array<{ domain: string }>>(
    "SELECT DISTINCT domain FROM GraphNode"
  );
  console.log(
    `归一后 DISTINCT domain（${distinct.length} 个）：${distinct.map((d) => d.domain).join(" / ")}`
  );
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
