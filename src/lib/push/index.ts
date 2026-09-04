import type { PushMessage, PushResult } from "./types";
import { ServerChanChannel } from "./channels/server-chan";

export type { PushMessage, PushResult, PushChannel } from "./types";

function getDefaultSendKey(): string | undefined {
  return process.env.SERVER_CHAN_SEND_KEY;
}

/**
 * 推送到指定用户。
 *
 * - 传入 `sendKey`：推送到该 SendKey 对应的微信（如班级成员在 /classroom/settings 绑定的 key）。
 * - 不传：回落到环境变量 `SERVER_CHAN_SEND_KEY`（应用所有者的默认通道，背诵模块提醒走这条路）。
 *
 * 未来扩展：按 userId 查库选通道、支持更多 PushChannel 实现。
 */
export async function pushToUser(
  message: PushMessage & { sendKey?: string }
): Promise<PushResult> {
  const sendKey = message.sendKey || getDefaultSendKey();
  if (!sendKey) {
    console.error("[push] sendKey is required (message.sendKey or SERVER_CHAN_SEND_KEY)");
    return {
      success: false,
      error: "sendKey is required (message.sendKey or SERVER_CHAN_SEND_KEY)",
      provider: "server-chan",
    };
  }

  const channel = new ServerChanChannel(sendKey);

  try {
    const result = await channel.send(message);
    if (!result.success) {
      console.error("[push] failed to push message:", result.error);
    }
    return result;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error("[push] unexpected error:", reason);
    return {
      success: false,
      error: reason,
      provider: channel.provider,
    };
  }
}
