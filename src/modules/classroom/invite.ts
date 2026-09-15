/**
 * 班级邀请码有效期约定：
 * - 新建班级邀请码默认有效 INVITE_EXPIRE_DAYS 天（建班与重新生成时统一从这里取）；
 * - inviteExpireAt 为 null 表示永久有效（迁移前存量数据兼容）。
 * 纯函数，组件/Action 共用；组件侧请把 now 作为参数传入（react 纯度 lint）。
 */
export const INVITE_EXPIRE_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/** 从 now 起算默认有效期的到期时刻 */
export function inviteExpireAtFrom(now: Date): Date {
  return new Date(now.getTime() + INVITE_EXPIRE_DAYS * DAY_MS);
}

/** 邀请码是否已过期（null 永不过期） */
export function isInviteExpired(
  inviteExpireAt: Date | null | undefined,
  now: Date
): boolean {
  return !!inviteExpireAt && inviteExpireAt.getTime() <= now.getTime();
}
