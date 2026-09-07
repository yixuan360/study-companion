import { prisma } from "@/lib/db";
import { BackLink } from "@/app/_components/BackLink";
import { estimateCost } from "@/lib/ai/pricing";
import { UsageChart } from "./UsageChart";

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/** 数据组装放在组件外（含 Date.now 非纯调用，React 编译器 purity 规则只约束组件体） */
async function loadUsage() {
  const cutoff = new Date(Date.now() - 29 * 86_400_000);
  cutoff.setHours(0, 0, 0, 0);

  const [overall, byModule, byModel, recent] = await Promise.all([
    prisma.apiLog.aggregate({
      where: { success: true },
      _sum: {
        promptTokens: true,
        completionTokens: true,
        totalTokens: true,
      },
      _count: { id: true },
    }),
    prisma.apiLog.groupBy({
      by: ["module"],
      where: { success: true },
      _sum: { promptTokens: true, completionTokens: true, totalTokens: true },
      _count: { id: true },
    }),
    prisma.apiLog.groupBy({
      by: ["provider", "model"],
      where: { success: true },
      _sum: { promptTokens: true, completionTokens: true, totalTokens: true },
      _avg: { durationMs: true },
      _count: { id: true },
    }),
    prisma.apiLog.findMany({
      where: { success: true, createdAt: { gte: cutoff } },
      select: { createdAt: true, totalTokens: true },
    }),
  ]);

  const days: string[] = [];
  const tokensByDay = new Map<string, number>();
  for (let i = 29; i >= 0; i--) {
    const key = dayKey(new Date(Date.now() - i * 86_400_000));
    days.push(key);
    tokensByDay.set(key, 0);
  }
  for (const log of recent) {
    const key = dayKey(log.createdAt);
    if (tokensByDay.has(key)) {
      tokensByDay.set(key, (tokensByDay.get(key) ?? 0) + log.totalTokens);
    }
  }

  return {
    total: {
      calls: overall._count.id,
      promptTokens: overall._sum.promptTokens ?? 0,
      completionTokens: overall._sum.completionTokens ?? 0,
      totalTokens: overall._sum.totalTokens ?? 0,
      costYuan: estimateCost(
        "deepseek-chat",
        overall._sum.promptTokens ?? 0,
        overall._sum.completionTokens ?? 0
      ),
    },
    byModule: byModule
      .map((m) => ({
        module: m.module ?? "（未标注）",
        calls: m._count.id,
        totalTokens: m._sum.totalTokens ?? 0,
        // 模块级费用按 token 占比折算总额（多模型混用时为近似值）
        costYuan: (m._sum.totalTokens ?? 0) / (overall._sum.totalTokens || 1) * estimateCost(
          "deepseek-chat",
          overall._sum.promptTokens ?? 0,
          overall._sum.completionTokens ?? 0
        ),
      }))
      .sort((a, b) => b.totalTokens - a.totalTokens),
    byModel: byModel
      .map((m) => ({
        provider: m.provider,
        model: m.model,
        calls: m._count.id,
        promptTokens: m._sum.promptTokens ?? 0,
        completionTokens: m._sum.completionTokens ?? 0,
        totalTokens: m._sum.totalTokens ?? 0,
        avgDurationMs: m._avg.durationMs ?? 0,
        costYuan: estimateCost(
          m.model,
          m._sum.promptTokens ?? 0,
          m._sum.completionTokens ?? 0
        ),
      }))
      .sort((a, b) => b.totalTokens - a.totalTokens),
    days,
    tokensByDay: days.map((d) => tokensByDay.get(d) ?? 0),
  };
}

function formatYuan(v: number): string {
  return v >= 1 ? v.toFixed(2) : v.toFixed(4);
}

function formatTokens(n: number): string {
  return n >= 10000 ? `${(n / 10000).toFixed(1)} 万` : String(n);
}

export default async function AiUsagePage() {
  const data = await loadUsage();

  return (
    <main className="min-h-svh bg-zinc-50 px-4 py-6 pb-10 dark:bg-black sm:px-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6">
          <BackLink href="/">返回首页</BackLink>
        </div>
        <h1 className="mb-1 text-2xl font-bold text-zinc-900 dark:text-zinc-50">AI 用量</h1>
        <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
          所有 AI 调用的 token 消耗与费用估算；价格为可编辑的估算表（src/lib/ai/pricing.ts），以服务商账单为准
        </p>

        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "总调用", value: String(data.total.calls) },
            { label: "总 token", value: formatTokens(data.total.totalTokens) },
            { label: "输入/输出", value: `${formatTokens(data.total.promptTokens)} / ${formatTokens(data.total.completionTokens)}` },
            { label: "估算费用", value: `¥${formatYuan(data.total.costYuan)}` },
          ].map((card) => (
            <div
              key={card.label}
              className="rounded-2xl border border-zinc-200 bg-white p-4 text-center dark:border-zinc-800 dark:bg-zinc-900"
            >
              <p className="text-xl font-bold text-indigo-600 dark:text-indigo-300">{card.value}</p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{card.label}</p>
            </div>
          ))}
        </div>

        <section className="mb-6 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            近 30 天每日消耗（token）
          </h2>
          {data.tokensByDay.every((v) => v === 0) ? (
            <p className="py-8 text-center text-sm text-zinc-400">近 30 天没有 AI 调用</p>
          ) : (
            <UsageChart days={data.days} tokensByDay={data.tokensByDay} />
          )}
        </section>

        <section className="mb-6 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            按功能模块
          </h2>
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {data.byModule.map((m) => (
              <li key={m.module} className="flex items-center justify-between py-2 text-sm">
                <span className="text-zinc-800 dark:text-zinc-200">{m.module}</span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {m.calls} 次 · {formatTokens(m.totalTokens)} token · ≈¥{formatYuan(m.costYuan)}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">按模型</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs text-zinc-400 dark:text-zinc-500">
                  <th className="pb-2 pr-4 font-medium">模型</th>
                  <th className="pb-2 pr-4 font-medium">调用</th>
                  <th className="pb-2 pr-4 font-medium">输入</th>
                  <th className="pb-2 pr-4 font-medium">输出</th>
                  <th className="pb-2 pr-4 font-medium">均耗时</th>
                  <th className="pb-2 font-medium">估算费用</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {data.byModel.map((m) => (
                  <tr key={m.model}>
                    <td className="py-2 pr-4 text-zinc-800 dark:text-zinc-200">
                      {m.model}
                      <span className="ml-1 text-xs text-zinc-400">({m.provider})</span>
                    </td>
                    <td className="py-2 pr-4 text-zinc-600 dark:text-zinc-300">{m.calls}</td>
                    <td className="py-2 pr-4 text-zinc-600 dark:text-zinc-300">
                      {formatTokens(m.promptTokens)}
                    </td>
                    <td className="py-2 pr-4 text-zinc-600 dark:text-zinc-300">
                      {formatTokens(m.completionTokens)}
                    </td>
                    <td className="py-2 pr-4 text-zinc-600 dark:text-zinc-300">
                      {(m.avgDurationMs / 1000).toFixed(1)}s
                    </td>
                    <td className="py-2 text-zinc-600 dark:text-zinc-300">
                      ≈¥{formatYuan(m.costYuan)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
