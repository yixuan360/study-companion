import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { addDays, parseDateOnly } from "@/modules/companion/plan";

interface BatchCreateRequest {
  goalId: string;
  /** 该周周一的日期 YYYY-MM-DD，任务 day=N 落在 weekStart+(N-1) */
  weekStart: string;
  tasks: { day: number; title: string; detail: string; minutes: number }[];
}

function bad(msg: string, status = 400) {
  return NextResponse.json({ code: status, data: null, msg }, { status });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<BatchCreateRequest>;
    if (!body.goalId?.trim()) {
      return bad("goalId 不能为空");
    }
    if (!Array.isArray(body.tasks) || body.tasks.length === 0) {
      return bad("任务列表不能为空");
    }

    const goal = await prisma.goal.findUnique({
      where: { id: body.goalId.trim() },
      include: { phases: { orderBy: { order: "asc" } } },
    });
    if (!goal) {
      return bad("目标不存在", 404);
    }

    let weekStartDate: Date;
    try {
      weekStartDate = parseDateOnly(body.weekStart, "weekStart");
    } catch (err) {
      return bad(err instanceof Error ? err.message : String(err));
    }
    const weekEnd = addDays(weekStartDate, 7);

    for (const [index, task] of body.tasks.entries()) {
      const n = index + 1;
      if (!Number.isInteger(task.day) || task.day < 1 || task.day > 7) {
        return bad(`第 ${n} 条任务 day 应为 1-7`);
      }
      if (typeof task.title !== "string" || !task.title.trim()) {
        return bad(`第 ${n} 条任务标题不能为空`);
      }
      if (typeof task.detail !== "string" || !task.detail.trim()) {
        return bad(`第 ${n} 条任务详情不能为空`);
      }
      if (!Number.isInteger(task.minutes) || task.minutes <= 0) {
        return bad(`第 ${n} 条任务预计分钟必须为正整数`);
      }
    }

    const duplicate = await prisma.task.findFirst({
      where: { goalId: goal.id, dueDate: { gte: weekStartDate, lt: weekEnd } },
      select: { id: true },
    });
    if (duplicate) {
      return bad("该周任务已存在，请勿重复入库", 409);
    }

    const created = await prisma.task.createMany({
      data: body.tasks.map((task) => {
        const dueDate = addDays(weekStartDate, task.day - 1);
        const phase = goal.phases.find(
          (p) => p.startDate <= dueDate && p.endDate >= dueDate
        );
        return {
          goalId: goal.id,
          phaseId: phase?.id ?? null,
          title: task.title,
          detail: task.detail,
          estMinutes: task.minutes,
          dueDate,
        };
      }),
    });

    return NextResponse.json({
      code: 0,
      data: { created: created.count },
      msg: "",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[companion/tasks/batch-create] failed:", message);
    return NextResponse.json({ code: 500, data: null, msg: message }, { status: 500 });
  }
}
