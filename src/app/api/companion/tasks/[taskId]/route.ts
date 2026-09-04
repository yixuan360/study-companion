import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

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
    };

    const status = body.status as Status | undefined;
    if (!status || !VALID_STATUSES.includes(status)) {
      return bad("status 应为 pending/done/skipped");
    }
    const resultNote = body.resultNote?.trim() || null;
    if (status === "pending" && resultNote) {
      return bad("撤销打卡时不携带备注");
    }

    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      return bad("任务不存在", 404);
    }

    const updated = await prisma.task.update({
      where: { id: taskId },
      data: {
        status,
        resultNote: status === "pending" ? null : resultNote,
        doneAt: status === "done" ? new Date() : null,
      },
    });

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
