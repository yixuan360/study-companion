import { prisma } from "@/lib/db";
import Link from "next/link";
import { BackLink } from "@/app/_components/BackLink";
import { GraphTabs } from "../_components/GraphTabs";
import { GrowthCharts } from "./GrowthCharts";

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/** 数据组装放在组件外的普通函数里（含 Date.now 等非纯调用，React 编译器 purity 规则只约束组件体） */
async function loadGrowthData() {
  const nowMs = Date.now();
  const cutoff = new Date(nowMs - 30 * 86_400_000);

  const [nodeCount, edgeCount, sourceCount, domains, recentSources, recentNodes] =
    await Promise.all([
      prisma.graphNode.count(),
      prisma.graphEdge.count(),
      prisma.source.count(),
      prisma.graphNode.groupBy({ by: ["domain"], _count: { _all: true } }),
      prisma.source.findMany({
        where: { createdAt: { gte: cutoff } },
        select: { createdAt: true },
      }),
      prisma.graphNode.findMany({
        where: { createdAt: { gte: cutoff } },
        select: { createdAt: true },
      }),
    ]);

  // 近 30 天每日序列（本地自然日）
  const days: string[] = [];
  const sourcesByDay = new Map<string, number>();
  const nodesByDay = new Map<string, number>();
  for (let i = 29; i >= 0; i--) {
    const key = dayKey(new Date(nowMs - i * 86_400_000));
    days.push(key);
    sourcesByDay.set(key, 0);
    nodesByDay.set(key, 0);
  }
  for (const s of recentSources) {
    const key = dayKey(s.createdAt);
    if (sourcesByDay.has(key)) sourcesByDay.set(key, (sourcesByDay.get(key) ?? 0) + 1);
  }
  for (const n of recentNodes) {
    const key = dayKey(n.createdAt);
    if (nodesByDay.has(key)) nodesByDay.set(key, (nodesByDay.get(key) ?? 0) + 1);
  }

  const domainDistribution = domains
    .map((d) => ({ name: d.domain, value: d._count._all }))
    .sort((a, b) => b.value - a.value);

  return {
    nodeCount,
    edgeCount,
    sourceCount,
    days,
    sourcesByDay: days.map((d) => sourcesByDay.get(d) ?? 0),
    nodesByDay: days.map((d) => nodesByDay.get(d) ?? 0),
    domainDistribution,
  };
}

export default async function GraphGrowthPage() {
  const data = await loadGrowthData();

  return (
    <main className="min-h-svh bg-zinc-50 px-4 py-6 pb-24 sm:px-6 sm:pb-6 dark:bg-black">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6">
          <BackLink href="/graph">返回图谱</BackLink>
        </div>
        <GraphTabs />

        <h1 className="mb-6 text-2xl font-bold text-zinc-900 dark:text-zinc-50">成长视图</h1>

        <div className="mb-6 grid grid-cols-3 gap-3">
          {[
            { label: "知识点", value: data.nodeCount, href: "/graph" },
            { label: "关联", value: data.edgeCount, href: "/graph" },
            { label: "来源", value: data.sourceCount, href: "/graph/sources" },
          ].map((card) => (
            <Link
              key={card.label}
              href={card.href}
              className="rounded-2xl border border-zinc-200 bg-white p-4 text-center shadow-sm transition hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
            >
              <p className="text-3xl font-bold text-violet-600 dark:text-violet-300">
                {card.value}
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{card.label}</p>
            </Link>
          ))}
        </div>

        {data.nodeCount === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center dark:border-zinc-700 dark:bg-zinc-900">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              还没有数据，去
              <Link href="/graph/import" className="text-violet-600 underline dark:text-violet-300">
                喂入
              </Link>
              第一篇知识吧
            </p>
          </div>
        ) : (
          <GrowthCharts
            days={data.days}
            sourcesByDay={data.sourcesByDay}
            nodesByDay={data.nodesByDay}
            domainDistribution={data.domainDistribution}
          />
        )}
      </div>
    </main>
  );
}
