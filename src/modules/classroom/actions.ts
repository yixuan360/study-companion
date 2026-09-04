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

  // 邀请链接流程：创建身份后自动加入班级
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  if (code) {
    const classroom = await prisma.classroom.findUnique({
      where: { inviteCode: code },
    });
    if (classroom) {
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
