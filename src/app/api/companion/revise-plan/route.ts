import { NextResponse } from "next/server";
import { chat } from "@/lib/ai";
import { parsePlan, type GeneratedPlan } from "@/modules/companion/plan";

interface ReviseContext {
  title?: string;
  deadline?: string;
  dailyMinutes?: number;
  userContext?: string;
}

function buildRevisePrompt(plan: GeneratedPlan, instruction: string, context: ReviseContext): string {
  return `你是备考规划师。用户确认了如下备考计划（JSON）：
${JSON.stringify(plan, null, 2)}
目标背景：${context.title ?? "未提供"}，截止：${context.deadline ?? "未提供"}，每日可投入：${context.dailyMinutes ?? "未提供"}分钟，现状：${context.userContext ?? "未提供"}。

用户提出如下修改指令：「${instruction}」

请输出修改后的完整计划，严格 JSON，字段结构必须与输入完全一致：
{
  "assessment": "差距评估，一段文字，最多3条，用换行分隔",
  "phases": [{"name":"阶段名","weeks":周数,"focus":"本阶段重点","exitCriteria":"阶段结束标志"}],
  "week1Tasks": [{"day":1,"title":"具体任务","detail":"怎么做、做到什么程度","minutes":30}]
}
要求：
1. 只按指令修改相关部分，未被指令触及的部分保持原样
2. 任务必须具体可执行；同一天的多个任务 minutes 总和不得超过每日可投入分钟数
3. 阶段 weeks 为正整数；week1Tasks 的 day 为 1-7（第 1 天 = 明天开始的第一天）
4. 如果指令与目标背景冲突（如时间不够），在 assessment 末尾用一行说明取舍`;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      plan?: unknown;
      instruction?: string;
      context?: ReviseContext;
    };

    // 复用 parsePlan 校验入参计划，防止脏数据进 prompt
    let plan: GeneratedPlan;
    try {
      plan = parsePlan(body.plan);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ code: 400, data: null, msg: `计划草稿无效：${message}` }, { status: 400 });
    }

    const instruction = body.instruction?.trim();
    if (!instruction) {
      return NextResponse.json({ code: 400, data: null, msg: "修改指令不能为空" }, { status: 400 });
    }

    const result = await chat({
      messages: [
        { role: "user", content: buildRevisePrompt(plan, instruction, body.context ?? {}) },
      ],
      taskType: "complex",
      module: "备考计划",
      responseFormat: "json",
    });

    const revised: GeneratedPlan = parsePlan(JSON.parse(result.content));

    return NextResponse.json({ code: 0, data: { plan: revised }, msg: "" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[companion/revise-plan] failed:", message);
    return NextResponse.json({ code: 500, data: null, msg: message }, { status: 500 });
  }
}
