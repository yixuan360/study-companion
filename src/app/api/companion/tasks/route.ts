import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseDateOnly } from "@/modules/companion/plan";

function bad(msg: string, status = 400) {
  return NextResponse.json({ code: status, data: null, msg }, { status });
}

/** 手动新增单条任务（执行中调整），挂接到期日所在阶段 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      goalId?: string;
      title?: string;
      detail?: string;
      estMinutes?: number;
      dueDate?: string;
    };

    if (!body.goalId?.trim()) return bad("goalId 不能为空");
    const title = body.title?.trim();
    if (!title) return bad("任务标题不能为空");
    const detail = body.detail?.trim();
    if (!detail) return bad("任务详情不能为空");
    const minutes = Number(body.estMinutes);
    if (!Number.isInteger(minutes) || minutes <= 0 || minutes > 1440) {
      return bad("预计分钟应为 1-1440 的整数");
    }
    let dueDate: Date;
    try {
      dueDate = parseDateOnly(body.dueDate, "到期日");
    } catch (err) {
      return bad(err instanceof Error ? err.message : String(err));
    }

    const goal = await prisma.goal.findUnique({
      where: { id: body.goalId.trim() },
      include: { phases: { orderBy: { order: "asc" } } },
    });
    if (!goal) return bad("目标不存在", 404);

    const phase = goal.phases.find((p) => p.startDate <= dueDate && p.endDate >= dueDate);

    const created = await prisma.task.create({
      data: {
        goalId: goal.id,
        phaseId: phase?.id ?? null,
        title,
        detail,
        estMinutes: minutes,
        dueDate,
      },
      select: { id: true },
    });

    return NextResponse.json({ code: 0, data: { id: created.id }, msg: "" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[companion/tasks] create failed:", message);
    return NextResponse.json({ code: 500, data: null, msg: message }, { status: 500 });
  }
}
