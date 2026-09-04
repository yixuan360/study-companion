import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { forbiddenResponse, isMember } from "@/modules/classroom/membership";
import { parseTaskInput } from "@/modules/classroom/tasks";

function bad(msg: string, status = 400) {
  return NextResponse.json({ code: status, data: null, msg }, { status });
}

/** 确认发布：批量入库班级任务（ createdBy=当前成员 ） */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user) {
      return bad("请先创建身份", 401);
    }
    if (!(await isMember(id, user.id))) {
      return forbiddenResponse();
    }

    const body = (await request.json()) as { tasks?: unknown[] };
    if (!Array.isArray(body.tasks) || body.tasks.length === 0) {
      return bad("任务列表不能为空");
    }

    const inputs = body.tasks.map((t, i) => parseTaskInput(t, i));

    const created = await prisma.classTask.createMany({
      data: inputs.map((task) => ({
        classroomId: id,
        title: task.title,
        detail: task.detail,
        platform: task.platform,
        course: task.course,
        deadline: task.deadline,
        sourceType: task.sourceType,
        type: task.type,
        createdBy: user.id,
      })),
    });

    return NextResponse.json({ code: 0, data: { created: created.count }, msg: "" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[classroom/tasks] failed:", message);
    return NextResponse.json({ code: 500, data: null, msg: message }, { status: 500 });
  }
}
