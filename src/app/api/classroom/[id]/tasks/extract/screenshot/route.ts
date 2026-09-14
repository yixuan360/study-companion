import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { forbiddenResponse, isMember } from "@/modules/classroom/membership";
import { parseExtractedTasks } from "@/modules/classroom/tasks";
import {
  assertScreenshotBase64,
  buildImageDataUrl,
  buildScreenshotContent,
  SCREENSHOT_OUTPUT_MIME,
} from "@/modules/classroom/image";
import { chat } from "@/lib/ai";

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

function bad(msg: string, status = 400) {
  return NextResponse.json({ code: status, data: null, msg }, { status });
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** 与文本提取同款本地日期锚点：图中"本周五"等相对时间以今天为基准换算 */
function buildScreenshotPrompt(): string {
  const now = new Date();
  const weekday = "日一二三四五六"[now.getDay()];
  const localToday = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
    now.getDate()
  )}`;
  return `识别图片中的班级群通知/作业通知，提取任务信息，输出严格 JSON：
{"tasks":[{"title":"任务标题","detail":"具体要求（保留关键细节）","deadline":"YYYY-MM-DD HH:mm","platform":"学习通|雨课堂|邮箱|线下|其他","course":"课程名，未提及则null","type":"作业|考试|活动|通知","confidence":0到1}]}
规则：
1. 今天是 ${localToday}（星期${weekday}，ISO: ${now.toISOString()}），图中的相对时间（如"本周五""下周三前"）必须换算为绝对日期，以本地日期 ${localToday} 为基准
2. 截止时间无法确定时 confidence 降到 0.5 以下并在 detail 注明"时间待确认"
3. 一条通知含多个任务则输出多个
4. 只提取图中明确写出的任务，不要脑补
5. 图中没有可识别的通知内容（纯闲聊/表情包/无文字）返回 {"tasks":[]}`;
}

/** 纯文本模型不支持图片时，提供商报错通常包含 image/图片 等关键字 */
function isMultimodalUnsupported(message: string): boolean {
  return /image|图片|multimodal|vision|media type/i.test(message);
}

/** 截图提取：多模态识别班级通知截图 → 结构化任务列表（预览确认后另走发布接口入库） */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user) {
      return bad("请先创建身份", 401);
    }
    if (!(await isMember(id, user.id))) {
      return forbiddenResponse();
    }

    const body = (await request.json()) as {
      image?: string;
      mimeType?: string;
    };
    const image = typeof body.image === "string" ? body.image.trim() : "";
    try {
      assertScreenshotBase64(image);
    } catch (err) {
      return bad(err instanceof Error ? err.message : String(err));
    }
    const mimeType = ALLOWED_MIME_TYPES.includes(body.mimeType ?? "")
      ? (body.mimeType as string)
      : SCREENSHOT_OUTPUT_MIME;

    let result;
    try {
      result = await chat({
        messages: [
          {
            role: "user",
            content: buildScreenshotContent(
              buildScreenshotPrompt(),
              buildImageDataUrl(mimeType, image)
            ),
          },
        ],
        taskType: "simple",
        provider: "deepseek",
        module: "classroom-screenshot",
        responseFormat: "json",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[classroom/tasks/extract/screenshot] chat failed:", message);
      const hint = isMultimodalUnsupported(message)
        ? `当前模型可能不支持图片（DEEPSEEK_MODEL=${process.env.DEEPSEEK_MODEL ?? ""}），请换成多模态模型如 deepseek-flash。`
        : "";
      const msg = hint ? `AI 识别失败：${hint}` : "AI 识别失败，请重试或改用文字粘贴提取";
      return bad(msg);
    }

    let tasks;
    try {
      tasks = parseExtractedTasks(JSON.parse(result.content));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[classroom/tasks/extract/screenshot] parse failed:", message);
      return bad("AI 返回结果解析失败，请重试或改用文字粘贴提取");
    }

    return NextResponse.json({ code: 0, data: { tasks }, msg: "" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[classroom/tasks/extract/screenshot] failed:", message);
    return NextResponse.json({ code: 500, data: null, msg: message }, { status: 500 });
  }
}
