import type { PushMessage, PushResult } from "./types";
import { ServerChanChannel } from "./channels/server-chan";

export type { PushMessage, PushResult, PushChannel } from "./types";

function getDefaultSendKey(): string | undefined {
  return process.env.SERVER_CHAN_SEND_KEY;
}

/**
 * Push a message to the default recipient.
 *
 * MVP: The application only supports a single owner, so we read the SendKey
 * directly from `SERVER_CHAN_SEND_KEY`. In the future this can be extended to:
 * - accept a `userId` argument;
 * - look up the user's bound SendKey (and preferred channel) from the database;
 * - instantiate the matching `PushChannel` and send.
 */
export async function pushToUser(message: PushMessage): Promise<PushResult> {
  const sendKey = getDefaultSendKey();
  if (!sendKey) {
    console.error("[push] SERVER_CHAN_SEND_KEY is not configured");
    return {
      success: false,
      error: "SERVER_CHAN_SEND_KEY is not configured",
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
