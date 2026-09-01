"use server";

import { pushToUser } from "@/lib/push";

export interface PushTestResult {
  success: boolean;
  error?: string;
  sentAt: string;
  configured: boolean;
  keyHint?: string;
}

function maskSendKey(key: string): string {
  if (key.length <= 8) {
    return "*".repeat(key.length);
  }
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

export async function sendPushTest(): Promise<PushTestResult> {
  const sentAt = new Date().toLocaleString("zh-CN", {
    dateStyle: "full",
    timeStyle: "medium",
  });

  const sendKey = process.env.SERVER_CHAN_SEND_KEY;
  const configured = !!sendKey;

  const result = await pushToUser({
    title: "学习伴侣推送测试成功 ✅",
    content: `当前时间：${sentAt}`,
  });

  return {
    success: result.success,
    error: result.error,
    sentAt,
    configured,
    keyHint: sendKey ? maskSendKey(sendKey) : undefined,
  };
}
