import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { forbiddenResponse, isMember } from "@/modules/classroom/membership";

function bad(msg: string, status = 400) {
  return NextResponse.json({ code: status, data: null, msg }, { status });
}

/** 切换当前用户自己的完成状态：任务共享，完成状态个人化 */
export async function POST(
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
      select: { id: true },
    });
    if (!task) {
      return bad("任务不存在", 404);
    }

    const existing = await prisma.taskCompletion.findUnique({
      where: { taskId_userId: { taskId, userId: user.id } },
    });

    const completion = existing
      ? await prisma.taskCompletion.update({
          where: { id: existing.id },
          data: { done: !existing.done, doneAt: !existing.done ? new Date() : null },
        })
      : await prisma.taskCompletion.create({
          data: { taskId, userId: user.id, done: true, doneAt: new Date() },
        });

    return NextResponse.json({
      code: 0,
      data: { taskId, done: completion.done },
      msg: "",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[classroom/tasks/toggle] failed:", message);
    return NextResponse.json({ code: 500, data: null, msg: message }, { status: 500 });
  }
}
