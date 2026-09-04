import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { forbiddenResponse, isMember } from "@/modules/classroom/membership";
import {
  parseClassTaskType,
  parseDeadlineText,
} from "@/modules/classroom/tasks";

function bad(msg: string, status = 400) {
  return NextResponse.json({ code: status, data: null, msg }, { status });
}

/** 任何成员可编辑（老师改期场景），记录 updatedBy，@updatedAt 自动刷新 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  try {
    const { id, taskId } = await params;
    const user = await getCurrentUser();
    if (!user) {
      return bad("请先创建身份", 401);
    }
    if (!(await isMember(id, user.id))) {
      return forbiddenResponse();
    }

    const task = await prisma.classTask.findFirst({
      where: { id: taskId, classroomId: id },
    });
    if (!task) {
      return bad("任务不存在", 404);
    }

    const body = (await request.json()) as Record<string, unknown>;
    const data: {
      title?: string;
      detail?: string;
      deadline?: Date;
      platform?: string;
      course?: string | null;
      type?: "homework" | "exam" | "activity" | "notice";
      updatedBy: string;
    } = { updatedBy: user.id };

    if (body.title !== undefined) {
      const title = String(body.title).trim();
      if (!title) return bad("标题不能为空");
      data.title = title;
    }
    if (body.detail !== undefined) {
      const detail = String(body.detail).trim();
      if (!detail) return bad("具体要求不能为空");
      data.detail = detail;
    }
    if (body.deadline !== undefined) {
      data.deadline = parseDeadlineText(body.deadline);
    }
    if (body.platform !== undefined) {
      const platform = String(body.platform).trim();
      if (!platform) return bad("提交平台不能为空");
      data.platform = platform;
    }
    if (body.course !== undefined) {
      data.course =
        typeof body.course === "string" && body.course.trim() ? body.course.trim() : null;
    }
    if (body.type !== undefined) {
      data.type = parseClassTaskType(body.type);
    }

    const updated = await prisma.classTask.update({
      where: { id: taskId },
      data,
    });

    return NextResponse.json({
      code: 0,
      data: { id: updated.id, updatedAt: updated.updatedAt },
      msg: "",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[classroom/tasks/taskId] failed:", message);
    return NextResponse.json({ code: 500, data: null, msg: message }, { status: 500 });
  }
}
