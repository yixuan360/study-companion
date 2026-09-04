import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";

/**
 * MVP 轻量账号体系：无密码注册，sessionToken 存 httpOnly cookie，有效期 30 天。
 * 已知取舍：单设备单 token（重新创建身份会使旧 token 失效）、无找回机制。
 * 未来若需要多设备、OAuth、密码登录等，可整体替换为 NextAuth，
 * 只需保持 getCurrentUser() 的返回签名（User | null）不变，调用方无需改动。
 */
export const SESSION_COOKIE = "sc_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 天

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return prisma.user.findUnique({ where: { sessionToken: token } });
}

export async function createSessionToken(): Promise<string> {
  const token = randomUUID();
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  });
  return token;
}
