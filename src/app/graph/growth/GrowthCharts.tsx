"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart, PieChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsCoreOption, EChartsType } from "echarts/core";

echarts.use([
  BarChart,
  PieChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  CanvasRenderer,
]);

function useChart(option: EChartsCoreOption) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    if (!chartRef.current) {
      chartRef.current = echarts.init(ref.current);
    }
    chartRef.current.setOption(option, true);
    const handleResize = () => chartRef.current?.resize();
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, [option]);

  return ref;
}

export function GrowthCharts({
  days,
  sourcesByDay,
  nodesByDay,
  domainDistribution,
}: {
  days: string[];
  sourcesByDay: number[];
  nodesByDay: number[];
  domainDistribution: { name: string; value: number }[];
}) {
  const shortDays = days.map((d) => d.slice(5).replace("-", "/"));

  const barOption: EChartsCoreOption = {
    tooltip: { trigger: "axis" },
    legend: { data: ["喂入来源", "新增知识点"], bottom: 0, textStyle: { fontSize: 11 } },
    grid: { left: 30, right: 12, top: 16, bottom: 44 },
    xAxis: {
      type: "category",
      data: shortDays,
      axisLabel: { fontSize: 9, interval: 4 },
    },
    yAxis: { type: "value", minInterval: 1, axisLabel: { fontSize: 10 } },
    series: [
      {
        name: "喂入来源",
        type: "bar",
        data: sourcesByDay,
        itemStyle: { color: "#8b5cf6" },
        barMaxWidth: 10,
      },
      {
        name: "新增知识点",
        type: "bar",
        data: nodesByDay,
        itemStyle: { color: "#34d399" },
        barMaxWidth: 10,
      },
    ],
  };

  const pieOption: EChartsCoreOption = {
    tooltip: {},
    legend: { orient: "vertical", right: 0, top: "middle", textStyle: { fontSize: 11 } },
    series: [
      {
        type: "pie",
        radius: ["42%", "70%"],
        center: ["35%", "50%"],
        data: domainDistribution,
        label: { show: false },
        itemStyle: { borderRadius: 4 },
      },
    ],
  };

  const barRef = useChart(barOption);
  const pieRef = useChart(pieOption);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          近 30 天喂入与新增
        </h2>
        <div ref={barRef} className="h-52 w-full" />
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          你的知识版图
        </h2>
        <div ref={pieRef} className="h-64 w-full" />
      </section>
    </div>
  );
}
