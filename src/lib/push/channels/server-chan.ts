import type { PushChannel, PushMessage, PushResult } from "../types";

interface ServerChanResponse {
  code?: number;
  message?: string;
  data?: {
    pushid?: string;
    readkey?: string;
    error?: string;
    errno?: number;
  };
}

export class ServerChanChannel implements PushChannel {
  readonly provider = "server-chan";

  constructor(private readonly sendKey: string) {}

  async send(message: PushMessage): Promise<PushResult> {
    if (!this.sendKey) {
      return {
        success: false,
        error: "Missing Server Chan send key",
        provider: this.provider,
      };
    }

    if (!message.title || message.title.trim().length === 0) {
      return {
        success: false,
        error: "Title is required",
        provider: this.provider,
      };
    }

    const url = `https://sctapi.ftqq.com/${encodeURIComponent(
      this.sendKey
    )}.send`;

    const body = new URLSearchParams();
    body.append("title", message.title.trim());
    if (message.content) {
      body.append("desp", message.content);
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        body,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });

      let payload: ServerChanResponse | undefined;
      try {
        payload = (await response.json()) as ServerChanResponse;
      } catch {
        // Non-JSON response; fall through to status check.
      }

      if (response.ok && payload && payload.code === 0) {
        return { success: true, provider: this.provider };
      }

      const errorMsg =
        payload?.message ||
        payload?.data?.error ||
        `Server Chan returned HTTP ${response.status}`;

      return {
        success: false,
        error: errorMsg,
        provider: this.provider,
      };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: `Request failed: ${reason}`,
        provider: this.provider,
      };
    }
  }
}
