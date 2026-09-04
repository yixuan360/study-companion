import { prisma } from "@/lib/db";

/**
 * 数据隔离纪律（多租户安全底线）：
 * - 所有查询必须带 classroomId 条件，禁止全表扫班级任务；
 * - 所有写操作前必须校验当前用户是该班级成员，否则 403。
 * 本模块的页面与 API 一律先过 requireMembership / isMember。
 */
export async function isMember(
  classroomId: string,
  userId: string
): Promise<boolean> {
  const member = await prisma.classroomMember.findUnique({
    where: { classroomId_userId: { classroomId, userId } },
    select: { id: true },
  });
  return member !== null;
}

/** 页面用：非成员时抛 403（渲染 forbidden.tsx）。用户未登录由调用方先跳创建身份页。 */
export async function requireMembership(
  classroomId: string,
  userId: string
): Promise<void> {
  const { forbidden } = await import("next/navigation");
  const member = await isMember(classroomId, userId);
  if (!member) {
    forbidden();
  }
}

/** API 用返回体 */
export function forbiddenResponse() {
  return Response.json(
    { code: 403, data: null, msg: "非班级成员，禁止访问" },
    { status: 403 }
  );
}
