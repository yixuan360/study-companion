"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsCoreOption, EChartsType } from "echarts/core";

echarts.use([BarChart, GridComponent, TooltipComponent, CanvasRenderer]);

export function UsageChart({
  days,
  tokensByDay,
}: {
  days: string[];
  tokensByDay: number[];
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart: EChartsType = echarts.init(ref.current);
    const option: EChartsCoreOption = {
      tooltip: { trigger: "axis" },
      grid: { left: 48, right: 12, top: 16, bottom: 28 },
      xAxis: {
        type: "category",
        data: days.map((d) => d.slice(5).replace("-", "/")),
        axisLabel: { fontSize: 9, interval: 4 },
      },
      yAxis: { type: "value", axisLabel: { fontSize: 10 } },
      series: [
        {
          type: "bar",
          data: tokensByDay,
          itemStyle: { color: "#6366f1" },
          barMaxWidth: 12,
        },
      ],
    };
    chart.setOption(option, true);
    const handleResize = () => chart.resize();
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      chart.dispose();
    };
  }, [days, tokensByDay]);

  return <div ref={ref} className="h-48 w-full" />;
}
