import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { forbiddenResponse, isMember } from "@/modules/classroom/membership";
import { parseExtractedTasks } from "@/modules/classroom/tasks";
import { chat } from "@/lib/ai";

const MAX_CONTENT_LENGTH = 5000;

function bad(msg: string, status = 400) {
  return NextResponse.json({ code: status, data: null, msg }, { status });
}

function buildPrompt(content: string): string {
  const now = new Date();
  const weekday = "日一二三四五六"[now.getDay()];
  const localToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(now.getDate()).padStart(2, "0")}`;
  return `从以下班级通知中提取任务信息，输出严格 JSON：
{"tasks":[{"title":"任务标题","detail":"具体要求（保留关键细节）","deadline":"YYYY-MM-DD HH:mm","platform":"学习通|雨课堂|邮箱|线下|其他","course":"课程名，未提及则null","type":"作业|考试|活动|通知","confidence":0到1}]}
规则：
1. 今天是 ${localToday}（星期${weekday}，ISO: ${now.toISOString()}），原文的相对时间（如"本周五""下周三前"）必须换算为绝对日期，以本地日期 ${localToday} 为基准
2. 截止时间无法确定时 confidence 降到 0.5 以下并在 detail 注明"时间待确认"
3. 一条通知含多个任务则输出多个
4. 纯闲聊/无任务内容返回 {"tasks":[]}
通知内容：
"""
${content}
"""`;
}

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

    const body = (await request.json()) as { content?: string };
    const content = body.content?.trim();
    if (!content) {
      return bad("通知内容不能为空");
    }
    const processed =
      content.length > MAX_CONTENT_LENGTH ? content.slice(0, MAX_CONTENT_LENGTH) : content;

    const result = await chat({
      messages: [{ role: "user", content: buildPrompt(processed) }],
      taskType: "simple",
      module: "任务提取",
      responseFormat: "json",
    });

    const tasks = parseExtractedTasks(JSON.parse(result.content));

    return NextResponse.json({
      code: 0,
      data: {
        tasks,
        truncated: content.length > MAX_CONTENT_LENGTH,
      },
      msg: "",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[classroom/tasks/extract] failed:", message);
    return NextResponse.json({ code: 500, data: null, msg: message }, { status: 500 });
  }
}
