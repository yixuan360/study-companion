import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateWeeklyReport } from "@/modules/companion/weekly-report";

/**
 * 周报自动生成入口，供调度器/cron 每周日调用：
 * GET /api/cron/weekly-review?secret=xxx
 * 遍历所有 active 目标生成周报；本周已生成或无任务的跳过；单目标失败不阻塞其他目标。
 */
export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}

async function handle(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { code: 500, data: null, msg: "CRON_SECRET 未配置" },
      { status: 500 }
    );
  }

  const url = new URL(request.url);
  const provided =
    url.searchParams.get("secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  if (provided !== secret) {
    return NextResponse.json({ code: 401, data: null, msg: "未授权" }, { status: 401 });
  }

  const goals = await prisma.goal.findMany({
    where: { status: "active" },
    select: { id: true, title: true },
    orderBy: { createdAt: "asc" },
  });

  const details: { goalId: string; title: string; status: string }[] = [];
  for (const goal of goals) {
    try {
      const outcome = await generateWeeklyReport(goal.id);
      details.push({ goalId: goal.id, title: goal.title, status: outcome.status });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[cron/weekly-review] goal ${goal.id} failed:`, message);
      details.push({ goalId: goal.id, title: goal.title, status: "failed" });
    }
  }

  return NextResponse.json({
    code: 0,
    data: {
      generated: details.filter((d) => d.status === "created").length,
      skipped: details.filter((d) => d.status === "already-exists" || d.status === "no-tasks").length,
      failed: details.filter((d) => d.status === "failed").length,
      details,
    },
    msg: "",
  });
}
