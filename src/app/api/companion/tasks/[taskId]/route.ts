import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseDateOnly } from "@/modules/companion/plan";

const VALID_STATUSES = ["pending", "done", "skipped"] as const;
type Status = (typeof VALID_STATUSES)[number];

function bad(msg: string, status = 400) {
  return NextResponse.json({ code: status, data: null, msg }, { status });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;
    const body = (await request.json()) as {
      status?: string;
      resultNote?: string;
      title?: string;
      detail?: string;
      estMinutes?: number;
      dueDate?: string;
    };

    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      return bad("任务不存在", 404);
    }

    const data: {
      status?: Status;
      resultNote?: string | null;
      doneAt?: Date | null;
      title?: string;
      detail?: string;
      estMinutes?: number;
      dueDate?: Date;
    } = {};

    // 打卡字段（可选）：status 存在时按打卡语义处理
    if (body.status !== undefined) {
      const status = body.status as Status;
      if (!VALID_STATUSES.includes(status)) {
        return bad("status 应为 pending/done/skipped");
      }
      const resultNote = body.resultNote?.trim() || null;
      if (status === "pending" && resultNote) {
        return bad("撤销打卡时不携带备注");
      }
      data.status = status;
      data.resultNote = status === "pending" ? null : resultNote;
      data.doneAt = status === "done" ? new Date() : null;
    }

    // 编辑字段（可选）：执行中手动改任务
    if (body.title !== undefined) {
      const title = body.title.trim();
      if (!title) return bad("任务标题不能为空");
      data.title = title;
    }
    if (body.detail !== undefined) {
      const detail = body.detail.trim();
      if (!detail) return bad("任务详情不能为空");
      data.detail = detail;
    }
    if (body.estMinutes !== undefined) {
      const minutes = Number(body.estMinutes);
      if (!Number.isInteger(minutes) || minutes <= 0 || minutes > 1440) {
        return bad("预计分钟应为 1-1440 的整数");
      }
      data.estMinutes = minutes;
    }
    if (body.dueDate !== undefined) {
      try {
        data.dueDate = parseDateOnly(body.dueDate, "到期日");
      } catch (err) {
        return bad(err instanceof Error ? err.message : String(err));
      }
    }

    if (Object.keys(data).length === 0) {
      return bad("没有需要更新的字段");
    }

    // 改期后重新挂接阶段（与 batch-create 同规则：到期日所在阶段）
    if (data.dueDate) {
      const goal = await prisma.goal.findUnique({
        where: { id: task.goalId },
        include: { phases: { orderBy: { order: "asc" } } },
      });
      const phase = goal?.phases.find(
        (p) => p.startDate <= data.dueDate! && p.endDate >= data.dueDate!
      );
      // phaseId 不在 data 声明类型里，单独赋值
      (data as Record<string, unknown>).phaseId = phase?.id ?? null;
    }

    const updated = await prisma.task.update({ where: { id: taskId }, data });

    return NextResponse.json({
      code: 0,
      data: {
        id: updated.id,
        status: updated.status,
        resultNote: updated.resultNote,
        doneAt: updated.doneAt,
      },
      msg: "",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[companion/tasks] failed:", message);
    return NextResponse.json({ code: 500, data: null, msg: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      return bad("任务不存在", 404);
    }
    await prisma.task.delete({ where: { id: taskId } });
    return NextResponse.json({ code: 0, data: { id: taskId }, msg: "" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[companion/tasks] delete failed:", message);
    return NextResponse.json({ code: 500, data: null, msg: message }, { status: 500 });
  }
}
