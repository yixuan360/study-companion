import { describe, expect, it } from "vitest";
import {
  INVITE_EXPIRE_DAYS,
  inviteExpireAtFrom,
  isInviteExpired,
} from "./invite";

describe("inviteExpireAtFrom", () => {
  it("默认有效期为 7 天", () => {
    expect(INVITE_EXPIRE_DAYS).toBe(7);
    const now = new Date("2026-09-15T08:00:00");
    expect(inviteExpireAtFrom(now).getTime() - now.getTime()).toBe(
      7 * 24 * 60 * 60 * 1000
    );
  });
});

describe("isInviteExpired", () => {
  const now = new Date("2026-09-15T12:00:00");

  it("null（存量数据）永不过期", () => {
    expect(isInviteExpired(null, now)).toBe(false);
    expect(isInviteExpired(undefined, now)).toBe(false);
  });

  it("到期时刻在 now 之前为过期", () => {
    expect(isInviteExpired(new Date("2026-09-15T11:59:59"), now)).toBe(true);
  });

  it("恰好等于 now 视为过期", () => {
    expect(isInviteExpired(new Date("2026-09-15T12:00:00"), now)).toBe(true);
  });

  it("未到期返回 false", () => {
    expect(isInviteExpired(new Date("2026-09-22T12:00:00"), now)).toBe(false);
  });
});
