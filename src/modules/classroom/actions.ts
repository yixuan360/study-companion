"use server";

import { randomBytes, randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import {
  getCurrentUser,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth";
import { requireMembership } from "@/modules/classroom/membership";
import {
  inviteExpireAtFrom,
  isInviteExpired,
} from "@/modules/classroom/invite";

export interface FormState {
  error: string;
  success?: string;
}

// 邀请码去掉易混淆的 0/O/1/I/L
const INVITE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generateInviteCode(): string {
  const bytes = randomBytes(8);
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += INVITE_ALPHABET[bytes[i] % INVITE_ALPHABET.length];
  }
  return code;
}

/**
 * 创建身份（MVP 轻量账号体系：昵称必填 + 学号选填，sessionToken 存 httpOnly cookie 30 天）。
 * 未来可整体替换为 NextAuth，调用方只依赖 getCurrentUser()。
 */
export async function createIdentityAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const name = String(formData.get("name") ?? "").trim();
  const studentNo = String(formData.get("studentNo") ?? "").trim();

  if (!name) {
    return { error: "昵称不能为空" };
  }
  if (name.length > 20) {
    return { error: "昵称不能超过 20 个字" };
  }

  const token = randomUUID();
  const user = await prisma.user.create({
    data: {
      name,
      studentNo: studentNo || null,
      sessionToken: token,
    },
  });

  const cookieStore = await import("next/headers").then((m) => m.cookies());
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  });

  // 邀请链接流程：创建身份后自动加入班级（过期邀请码不入班，带错误提示回列表页）
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  if (code) {
    const classroom = await prisma.classroom.findUnique({
      where: { inviteCode: code },
    });
    if (classroom) {
      if (isInviteExpired(classroom.inviteExpireAt, new Date())) {
        redirect("/classroom?error=invite-expired");
      }
      await prisma.classroomMember.upsert({
        where: {
          classroomId_userId: { classroomId: classroom.id, userId: user.id },
        },
        create: { classroomId: classroom.id, userId: user.id },
        update: {},
      });
      revalidatePath("/classroom");
      redirect(`/classroom/${classroom.id}`);
    }
  }

  redirect("/classroom");
}

export async function createClassroomAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/classroom/identity");
  }

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    return { error: "班级名不能为空" };
  }
  if (name.length > 30) {
    return { error: "班级名不能超过 30 个字" };
  }

  let classroomId = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const classroom = await prisma.classroom.create({
        data: {
          name,
          inviteCode: generateInviteCode(),
          creatorId: user.id,
          inviteExpireAt: inviteExpireAtFrom(new Date()),
          members: {
            create: { userId: user.id },
          },
        },
      });
      classroomId = classroom.id;
      break;
    } catch (err) {
      // 邀请码唯一索引冲突则换码重试，其余错误直接抛出
      if (
        attempt === 2 ||
        !(err instanceof Error && err.message.includes("inviteCode"))
      ) {
        throw err;
      }
    }
  }
  if (!classroomId) {
    return { error: "创建失败，请重试" };
  }

  revalidatePath("/classroom");
  redirect(`/classroom/${classroomId!}`);
}

export async function joinClassroomAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/classroom/identity");
  }

  const code = String(formData.get("inviteCode") ?? "")
    .trim()
    .toUpperCase();
  if (!code) {
    return { error: "请输入邀请码" };
  }

  const classroom = await prisma.classroom.findUnique({
    where: { inviteCode: code },
  });
  if (!classroom) {
    return { error: "邀请码无效，请核对后重试" };
  }
  if (isInviteExpired(classroom.inviteExpireAt, new Date())) {
    return { error: "邀请码已过期，请联系班长重新生成" };
  }

  await prisma.classroomMember.upsert({
    where: { classroomId_userId: { classroomId: classroom.id, userId: user.id } },
    create: { classroomId: classroom.id, userId: user.id },
    update: {},
  });

  revalidatePath("/classroom");
  redirect(`/classroom/${classroom.id}`);
}

/** 邀请链接（/classroom/join?code=xxx）入班：已登录直接入班，未登录先带 code 去创建身份。 */
export async function joinByInviteCodeAction(code: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/classroom/identity?code=${encodeURIComponent(code)}`);
  }

  const classroom = await prisma.classroom.findUnique({
    where: { inviteCode: code.toUpperCase() },
  });
  if (!classroom) {
    redirect("/classroom?error=invalid-code");
  }
  if (isInviteExpired(classroom.inviteExpireAt, new Date())) {
    redirect("/classroom?error=invite-expired");
  }

  await prisma.classroomMember.upsert({
    where: { classroomId_userId: { classroomId: classroom.id, userId: user.id } },
    create: { classroomId: classroom.id, userId: user.id },
    update: {},
  });

  revalidatePath("/classroom");
  redirect(`/classroom/${classroom.id}`);
}

export async function updatePushKeyAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/classroom/identity");
  }

  const pushKey = String(formData.get("pushKey") ?? "").trim();
  if (!pushKey) {
    return { error: "SendKey 不能为空" };
  }
  if (!/^SCT[0-9]+$/.test(pushKey)) {
    return { error: "SendKey 格式应为 SCT 开头的一串数字（如 SCT123456…）" };
  }

  await prisma.user.update({ where: { id: user.id }, data: { pushKey } });
  revalidatePath("/classroom/settings");
  return { error: "", success: "SendKey 已保存" };
}

/** 用已保存的 SendKey 发一条测试消息，验证绑定是否成功 */
export async function sendTestPushAction(
  _prev: FormState,
  _formData: FormData
): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/classroom/identity");
  }
  if (!user.pushKey) {
    return { error: "请先填写并保存 SendKey" };
  }

  const { pushToUser } = await import("@/lib/push");
  const result = await pushToUser({
    sendKey: user.pushKey,
    title: "学习伴侣 · 测试消息",
    content: `你好 ${user.name ?? ""}，班级任务提醒绑定成功！任务到期前会推送到这条微信。`,
  });
  if (!result.success) {
    return { error: `测试消息发送失败：${result.error ?? "未知错误"}` };
  }
  return { error: "", success: "测试消息已发送，请在微信里查看" };
}

export async function signOutAction(): Promise<void> {
  const cookieStore = await import("next/headers").then((m) => m.cookies());
  cookieStore.delete(SESSION_COOKIE);
  redirect("/classroom/identity");
}

/**
 * 删除班级任务：仅任务录入人（createdBy）或班级创建者（班长）可删。
 * TaskCompletion 由 schema 的 onDelete: Cascade 级联清理，无需手动删除。
 */
export async function deleteClassTaskAction(
  classroomId: string,
  taskId: string
): Promise<{ error: string }> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/classroom/identity");
  }

  // 数据隔离纪律：非成员直接 403
  await requireMembership(classroomId, user.id);

  // 按 id + classroomId 取任务（禁止按 id 直取），同时带出班长 id 做权限判断
  const task = await prisma.classTask.findFirst({
    where: { id: taskId, classroomId },
    include: { classroom: { select: { creatorId: true } } },
  });
  if (!task) {
    return { error: "任务不存在或已被删除" };
  }
  if (task.createdBy !== user.id && task.classroom.creatorId !== user.id) {
    return { error: "只有任务录入人或班长可以删除该任务" };
  }

  await prisma.classTask.delete({ where: { id: task.id } });

  revalidatePath(`/classroom/${classroomId}`);
  return { error: "" };
}

/** 重新生成邀请码：新 code + 新有效期（INVITE_EXPIRE_DAYS 天），仅班级创建者可操作。 */
export async function regenerateInviteCodeAction(
  classroomId: string
): Promise<{ error: string }> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/classroom/identity");
  }

  await requireMembership(classroomId, user.id);

  const classroom = await prisma.classroom.findFirst({
    where: { id: classroomId },
    select: { creatorId: true },
  });
  if (!classroom) {
    return { error: "班级不存在" };
  }
  if (classroom.creatorId !== user.id) {
    return { error: "只有班长可以重新生成邀请码" };
  }

  const inviteExpireAt = inviteExpireAtFrom(new Date());
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await prisma.classroom.update({
        where: { id: classroomId },
        data: { inviteCode: generateInviteCode(), inviteExpireAt },
      });
      break;
    } catch (err) {
      // 邀请码唯一索引冲突则换码重试，其余错误直接抛出
      if (
        attempt === 2 ||
        !(err instanceof Error && err.message.includes("inviteCode"))
      ) {
        throw err;
      }
    }
  }

  revalidatePath(`/classroom/${classroomId}`);
  return { error: "" };
}

/**
 * 退出班级：删除 ClassroomMember 记录；TaskCompletion 历史保留不清理
 * （任务完成记录是班级共享数据，个人退出不影响历史统计）。
 * 创建者不可退出（MVP 不做转让/解散）。
 */
export async function leaveClassroomAction(
  classroomId: string
): Promise<{ error: string }> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/classroom/identity");
  }

  await requireMembership(classroomId, user.id);

  const classroom = await prisma.classroom.findFirst({
    where: { id: classroomId },
    select: { creatorId: true },
  });
  if (!classroom) {
    return { error: "班级不存在" };
  }
  if (classroom.creatorId === user.id) {
    return { error: "创建者暂不可退出" };
  }

  await prisma.classroomMember.delete({
    where: { classroomId_userId: { classroomId, userId: user.id } },
  });

  revalidatePath("/classroom");
  return { error: "" };
}
