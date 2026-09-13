import { NextResponse } from "next/server";
import { generateWeeklyReport } from "@/modules/companion/weekly-report";

function bad(msg: string, status = 400) {
  return NextResponse.json({ code: status, data: null, msg }, { status });
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const goalId = url.searchParams.get("goalId")?.trim();
  if (!goalId) {
    return bad("缺少 goalId 参数");
  }

  try {
    const outcome = await generateWeeklyReport(goalId);
    switch (outcome.status) {
      case "goal-not-found":
        return bad("目标不存在", 404);
      case "already-exists":
        return bad("本周周报已生成，可直接在周计划页查看与确认下周任务", 409);
      case "no-tasks":
        return bad("本周没有安排任务，无需生成周报");
      case "created":
        return NextResponse.json({
          code: 0,
          data: {
            reportId: outcome.reportId,
            riskLevel: outcome.riskLevel,
            summary: outcome.summary,
            adjustments: outcome.adjustments,
            completionRate: outcome.completionRate,
            nextWeekTasks: outcome.nextWeekTasks,
          },
          msg: "",
        });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[companion/weekly-review] failed:", message);
    return NextResponse.json({ code: 500, data: null, msg: message }, { status: 500 });
  }
}
