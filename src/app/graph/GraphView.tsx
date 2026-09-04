"use client";

import { useEffect, useRef, useState } from "react";
import * as echarts from "echarts/core";
import { GraphChart } from "echarts/charts";
import {
  TooltipComponent,
  LegendComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsCoreOption, EChartsType } from "echarts/core";

echarts.use([GraphChart, TooltipComponent, LegendComponent, CanvasRenderer]);

interface GraphNodeDatum {
  id: string;
  name: string;
  value: number;
  domain: string;
  symbolSize: number;
}

interface GraphEdgeDatum {
  source: string;
  target: string;
  label: string;
  value: number;
}

interface GraphStats {
  nodeCount: number;
  edgeCount: number;
  sourceCount: number;
  domains: { name: string; count: number }[];
}

interface GraphData {
  nodes: GraphNodeDatum[];
  edges: GraphEdgeDatum[];
  stats: GraphStats;
  truncated: boolean;
}

interface NodeDetail {
  id: string;
  name: string;
  aliases: string[];
  domain: string;
  summary: string;
  mentionCount: number;
  relations: {
    direction: "out" | "in";
    relation: string;
    weight: number;
    neighborId: string;
    neighborName: string;
  }[];
  sources: { sourceId: string; title: string; excerpt: string }[];
}

async function fetchNodeDetail(nodeId: string): Promise<NodeDetail> {
  const res = await fetch(`/api/graph/node/${nodeId}`);
  const json = (await res.json()) as {
    code: number;
    data: NodeDetail | null;
    msg: string;
  };
  if (json.code !== 0 || !json.data) {
    throw new Error(json.msg || "加载节点失败");
  }
  return json.data;
}

export function GraphView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType | null>(null);
  const [data, setData] = useState<GraphData | null>(null);
  const [domain, setDomain] = useState("");
  const [search, setSearch] = useState("");
  const [drawer, setDrawer] = useState<NodeDetail | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [expandedSource, setExpandedSource] = useState<string | null>(null);
  const [error, setError] = useState("");

  // 领域切换时重新拉取图谱数据（setState 均在 await 之后的回调里，非同步）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/graph/data${domain ? `?domain=${encodeURIComponent(domain)}` : ""}`
        );
        const json = (await res.json()) as {
          code: number;
          data: GraphData | null;
          msg: string;
        };
        if (json.code !== 0 || !json.data) {
          throw new Error(json.msg || "加载图谱失败");
        }
        if (!cancelled) {
          setData(json.data);
          setError("");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [domain]);

  // 组件卸载时销毁图表实例
  useEffect(() => {
    return () => {
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, []);

  // 数据变化时重建 ECharts 配置
  useEffect(() => {
    if (!containerRef.current || !data) return;
    if (!chartRef.current) {
      chartRef.current = echarts.init(containerRef.current);
    }
    const chart = chartRef.current;

    const domainNames = data.stats.domains.map((d) => d.name);
    const categoryIndex = new Map(domainNames.map((name, i) => [name, i]));

    const option: EChartsCoreOption = {
      tooltip: {},
      legend: [
        {
          data: domainNames,
          type: "scroll",
          bottom: 0,
          icon: "circle",
          textStyle: { fontSize: 11 },
        },
      ],
      series: [
        {
          type: "graph",
          layout: "force",
          force: { repulsion: 280, edgeLength: [70, 150], gravity: 0.08 },
          roam: true,
          draggable: true,
          categories: domainNames.map((name) => ({ name })),
          label: {
            show: true,
            position: "right",
            fontSize: 10,
            color: "#71717a",
          },
          edgeLabel: {
            show: false,
            fontSize: 10,
            formatter: (params: { data: { label?: string } }) =>
              String(params.data.label ?? ""),
          },
          emphasis: {
            focus: "adjacency",
            lineStyle: { width: 4 },
            edgeLabel: { show: true },
          },
          data: data.nodes.map((n) => ({
            id: n.id,
            name: n.name,
            value: n.value,
            symbolSize: n.symbolSize,
            category: categoryIndex.get(n.domain) ?? 0,
          })),
          links: data.edges.map((e) => ({
            source: e.source,
            target: e.target,
            value: e.value,
            // API 的 label 是关系文字；ECharts 里 link.label 是样式对象，这里做映射
            relationName: e.label,
            label: {
              show: false,
              formatter: (params: { data: { relationName?: string } }) =>
                String(params.data.relationName ?? ""),
            },
            lineStyle: {
              width: 1 + Math.min(4, Math.log2(e.value + 1)),
              curveness: 0.08,
            },
          })),
        },
      ],
    };

    chart.setOption(option, true);

    chart.off("click");
    chart.on("click", (params: echarts.ECElementEvent) => {
      if (params.dataType !== "node") return;
      const id = (params.data as { id?: string } | null)?.id;
      if (!id) return;
      (async () => {
        setDrawerLoading(true);
        setExpandedSource(null);
        try {
          const detail = await fetchNodeDetail(id);
          setDrawer(detail);
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        } finally {
          setDrawerLoading(false);
        }
      })();
    });

    const handleResize = () => chart.resize();
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [data]);

  function highlightNode(name: string) {
    const chart = chartRef.current;
    if (!chart) return;
    chart.dispatchAction({ type: "downplay", seriesIndex: 0 });
    chart.dispatchAction({ type: "highlight", seriesIndex: 0, name });
  }

  async function jumpToNode(nodeId: string, name: string) {
    highlightNode(name);
    setDrawerLoading(true);
    setExpandedSource(null);
    try {
      const detail = await fetchNodeDetail(nodeId);
      setDrawer(detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDrawerLoading(false);
    }
  }

  const searchMatches =
    search.trim() && data
      ? data.nodes
          .filter((n) => n.name.toLowerCase().includes(search.trim().toLowerCase()))
          .slice(0, 8)
      : [];

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}

      {/* 顶部工具栏 */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          className="min-h-[40px] rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
        >
          <option value="">全部领域</option>
          {data?.stats.domains.map((d) => (
            <option key={d.name} value={d.name}>
              {d.name}（{d.count}）
            </option>
          ))}
        </select>
        <div className="relative min-w-[160px] flex-1">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索知识点…"
            className="min-h-[40px] w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
          />
          {searchMatches.length > 0 && (
            <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
              {searchMatches.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => {
                      setSearch("");
                      jumpToNode(n.id, n.name);
                    }}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    <span>{n.name}</span>
                    <span className="text-xs text-zinc-400">
                      {n.domain} · 提及{n.value}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="ml-auto text-xs text-zinc-500 dark:text-zinc-400">
          共 {data?.stats.nodeCount ?? "-"} 个知识点 / {data?.stats.edgeCount ?? "-"} 条关联 /{" "}
          {data?.stats.sourceCount ?? "-"} 篇来源
        </p>
      </div>

      {data?.truncated && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-700 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-300">
          知识点较多，当前仅展示提及次数 ≥2 的核心节点，切到具体领域可看全量
        </p>
      )}

      {/* 力导向图画布：必须有明确高度 */}
      <div className="relative">
        <div
          ref={containerRef}
          className="h-[70svh] min-h-[420px] w-full rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
        />
        {!data && (
          <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-white/70 text-sm text-zinc-500 dark:bg-zinc-900/70 dark:text-zinc-400">
            图谱加载中…
          </div>
        )}
      </div>
      <p className="text-center text-xs text-zinc-400 dark:text-zinc-500">
        拖拽节点调整布局 · 滚轮/双指缩放 · 点击节点查看详情
      </p>

      {/* 节点详情底部抽屉 */}
      {(drawer || drawerLoading) && (
        <div className="fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setDrawer(null)}
          />
          <div className="absolute inset-x-0 bottom-0 mx-auto max-h-[80svh] max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5 pb-10 dark:bg-zinc-900">
            {drawerLoading || !drawer ? (
              <p className="py-8 text-center text-sm text-zinc-500">加载中…</p>
            ) : (
              <NodeDrawer
                detail={drawer}
                expandedSource={expandedSource}
                onToggleSource={(sid) =>
                  setExpandedSource((prev) => (prev === sid ? null : sid))
                }
                onJump={(nid, name) => jumpToNode(nid, name)}
                onClose={() => setDrawer(null)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NodeDrawer({
  detail,
  expandedSource,
  onToggleSource,
  onJump,
  onClose,
}: {
  detail: NodeDetail;
  expandedSource: string | null;
  onToggleSource: (sourceId: string) => void;
  onJump: (nodeId: string, name: string) => void;
  onClose: () => void;
}) {
  return (
    <div>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
              {detail.name}
            </h2>
            <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
              {detail.domain}
            </span>
            <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              提及 {detail.mentionCount} 次
            </span>
          </div>
          {detail.aliases.length > 0 && (
            <p className="text-xs text-zinc-400 dark:text-zinc-500">
              别名：{detail.aliases.join(" / ")}
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          className="min-h-[36px] rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          关闭
        </button>
      </div>

      <p className="mb-4 rounded-xl bg-zinc-50 p-3 text-sm leading-relaxed text-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-300">
        {detail.summary}
      </p>

      <section className="mb-4">
        <h3 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          关联知识点（{detail.relations.length}）
        </h3>
        {detail.relations.length === 0 ? (
          <p className="text-xs text-zinc-400">暂无关联</p>
        ) : (
          <ul className="space-y-1.5">
            {detail.relations.map((r) => (
              <li key={`${r.neighborId}-${r.relation}`}>
                <button
                  onClick={() => onJump(r.neighborId, r.neighborName)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  <span className="rounded bg-violet-100 px-1.5 py-0.5 text-xs text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
                    {r.relation}
                  </span>
                  <span className="text-zinc-800 dark:text-zinc-200">
                    {r.direction === "out" ? "→ " : "← "}
                    {r.neighborName}
                  </span>
                  {r.weight > 1 && (
                    <span className="ml-auto text-xs text-zinc-400">×{r.weight}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          出自来源（{detail.sources.length}）
        </h3>
        <ul className="space-y-2">
          {detail.sources.map((s) => (
            <li
              key={s.sourceId}
              className="rounded-xl border border-zinc-200 dark:border-zinc-800"
            >
              <button
                onClick={() => onToggleSource(s.sourceId)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-zinc-800 dark:text-zinc-200"
              >
                <span className="min-w-0 truncate">📚 {s.title}</span>
                <span className="shrink-0 text-xs text-zinc-400">
                  {expandedSource === s.sourceId ? "收起" : "展开"}
                </span>
              </button>
              {expandedSource === s.sourceId && (
                <p className="border-t border-zinc-100 px-3 py-2 text-xs leading-relaxed text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                  「{s.excerpt}」
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
