import { NextResponse } from "next/server";
import {
  sendClassroomTaskPush,
  type ClassroomPushMode,
} from "@/modules/classroom/reminder";

/**
 * 班级任务定时提醒入口，供外部 cron 服务调用：
 * GET /api/cron/classroom-push?secret=xxx&mode=morning|evening
 * 与 /api/cron/daily-reminder（背诵模块）共用 CRON_SECRET。
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

  const mode = url.searchParams.get("mode");
  if (mode !== "morning" && mode !== "evening") {
    return NextResponse.json(
      { code: 400, data: null, msg: "mode 应为 morning 或 evening" },
      { status: 400 }
    );
  }

  try {
    const result = await sendClassroomTaskPush(mode as ClassroomPushMode);
    return NextResponse.json({ code: 0, data: result, msg: "" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron/classroom-push] failed:", message);
    return NextResponse.json({ code: 500, data: null, msg: message }, { status: 500 });
  }
}
