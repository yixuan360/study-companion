import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { chat } from "@/lib/ai";
import { addDays, startOfToday } from "@/modules/companion/plan";
import { assembleContext, MEMORY_PACK_HEADER } from "@/modules/companion/memory";
import { toISODate } from "@/modules/companion/stats";

function bad(msg: string, status = 400) {
  return NextResponse.json({ code: status, data: null, msg }, { status });
}

function buildTodayDigest(
  tasks: { title: string; status: string; resultNote: string | null }[]
): string {
  const done = tasks.filter((t) => t.status === "done");
  const skipped = tasks.filter((t) => t.status === "skipped");
  const pending = tasks.filter((t) => t.status === "pending");

  const lines: string[] = [
    `任务总数 ${tasks.length}，完成 ${done.length}，跳过 ${skipped.length}，未处理 ${pending.length}`,
  ];
  if (done.length > 0) {
    lines.push("已完成：");
    for (const t of done) {
      lines.push(`- 「${t.title}」${t.resultNote ? `（${t.resultNote}）` : ""}`);
    }
  }
  if (skipped.length > 0) {
    lines.push("已跳过：");
    for (const t of skipped) {
      lines.push(`- 「${t.title}」${t.resultNote ? `原因：${t.resultNote}` : ""}`);
    }
  }
  if (pending.length > 0) {
    lines.push("未处理：");
    for (const t of pending) {
      lines.push(`- 「${t.title}」`);
    }
  }
  return lines.join("\n");
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { goalId?: string };
    const goalId = body.goalId?.trim();
    if (!goalId) {
      return bad("goalId 不能为空");
    }

    const goal = await prisma.goal.findUnique({ where: { id: goalId } });
    if (!goal) {
      return bad("目标不存在", 404);
    }

    const today = startOfToday();
    const tasks = await prisma.task.findMany({
      where: { goalId, dueDate: { gte: today, lt: addDays(today, 1) } },
      orderBy: { createdAt: "asc" },
    });
    if (tasks.length === 0) {
      return bad("今天没有安排任务，无需总结");
    }

    const memory = await assembleContext(goalId);
    const result = await chat({
      messages: [
        {
          role: "system",
          content: `${MEMORY_PACK_HEADER}\n\n${memory}`,
        },
        {
          role: "user",
          content: `请根据今日（${toISODate(today)}）任务完成情况，给用户写一段今日总结反馈。
要求：
1. 80 字以内
2. 先肯定做到的（引用具体任务或打卡备注），再指出最需要补的一件事
3. 给出明天的一个具体行动建议，语气鼓励但不空洞
今日完成情况：
${buildTodayDigest(tasks)}`,
        },
      ],
      taskType: "simple",
    });

    return NextResponse.json({
      code: 0,
      data: { feedback: result.content.trim() },
      msg: "",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[companion/daily-feedback] failed:", message);
    return NextResponse.json({ code: 500, data: null, msg: message }, { status: 500 });
  }
}
