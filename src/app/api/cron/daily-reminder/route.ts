import { NextResponse } from "next/server";
import { sendDailyReviewReminder } from "@/modules/recite/reminder";

/**
 * 定时复习提醒入口，供外部 cron 服务（如 Vercel Cron、系统 crontab）调用。
 * 需在 .env 中配置 CRON_SECRET，并通过 ?secret=xxx 或 Authorization: Bearer xxx 传入。
 */
export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}

async function handle(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { code: 500, data: null, msg: "CRON_SECRET 未配置" },
      { status: 500 }
    );
  }

  const url = new URL(request.url);
  const provided =
    url.searchParams.get("secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";

  if (provided !== secret) {
    return NextResponse.json({ code: 401, data: null, msg: "未授权" }, { status: 401 });
  }

  try {
    const result = await sendDailyReviewReminder();
    return NextResponse.json({ code: 0, data: result, msg: "" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron/daily-reminder] failed:", message);
    return NextResponse.json({ code: 500, data: null, msg: message }, { status: 500 });
  }
}
