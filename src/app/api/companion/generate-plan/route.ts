import { NextResponse } from "next/server";
import { chat } from "@/lib/ai";
import { parsePlan, parseDateOnly, type GeneratedPlan } from "@/modules/companion/plan";

export interface GeneratePlanRequest {
  title: string;
  category: string;
  deadline: string;
  dailyMinutes: number;
  userContext: string;
}

function buildPrompt(input: GeneratePlanRequest): string {
  return `你是备考规划师。用户目标：${input.title}，截止：${input.deadline}，现状：${input.userContext}，每日可投入：${input.dailyMinutes}分钟。
输出严格 JSON：
{
  "assessment": "差距评估，一段文字，最多3条，用换行分隔",
  "phases": [{"name":"阶段名","weeks":周数,"focus":"本阶段重点","exitCriteria":"阶段结束标志"}],
  "week1Tasks": [{"day":1,"title":"具体任务","detail":"怎么做、做到什么程度","minutes":30}]
}
要求：
1. 任务必须具体可执行，禁止"多背单词"这类模糊表述；任务量匹配每日可用时间
2. 同一天的多个任务 minutes 总和不得超过每日可投入分钟数
3. 阶段 weeks 为正整数，各阶段周数合计应覆盖从今天到截止日的全部时间`;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<GeneratePlanRequest>;
    const title = body.title?.trim();
    const userContext = body.userContext?.trim();
    const dailyMinutes = Number(body.dailyMinutes);

    if (!title) {
      return NextResponse.json({ code: 400, data: null, msg: "目标名称不能为空" }, { status: 400 });
    }
    if (!userContext) {
      return NextResponse.json({ code: 400, data: null, msg: "现状自述不能为空" }, { status: 400 });
    }
    if (!Number.isInteger(dailyMinutes) || dailyMinutes <= 0 || dailyMinutes > 1440) {
      return NextResponse.json({ code: 400, data: null, msg: "每日可投入分钟数应为 1-1440 的整数" }, { status: 400 });
    }

    let deadline: Date;
    try {
      deadline = parseDateOnly(body.deadline, "截止日期");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ code: 400, data: null, msg: message }, { status: 400 });
    }
    if (deadline.getTime() < new Date().setHours(0, 0, 0, 0)) {
      return NextResponse.json({ code: 400, data: null, msg: "截止日期不能早于今天" }, { status: 400 });
    }

    const result = await chat({
      messages: [
        {
          role: "user",
          content: buildPrompt({
            title,
            category: body.category?.trim() || "exam",
            deadline: body.deadline as string,
            dailyMinutes,
            userContext,
          }),
        },
      ],
      taskType: "complex",
      responseFormat: "json",
    });

    const plan: GeneratedPlan = parsePlan(JSON.parse(result.content));

    return NextResponse.json({
      code: 0,
      data: { plan },
      msg: "",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[companion/generate-plan] failed:", message);
    return NextResponse.json({ code: 500, data: null, msg: message }, { status: 500 });
  }
}
