import { NextResponse } from "next/server";
import { chat } from "@/lib/ai";

export interface WeekTaskInput {
  day: number;
  title: string;
  detail: string;
  minutes: number;
}

/** 校验下周任务数组（结构与 weekly.ts 的 nextWeekTasks 一致） */
function parseWeekTasks(raw: unknown): WeekTaskInput[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error("任务列表不能为空");
  }
  if (raw.length > 20) {
    throw new Error("任务列表过长");
  }
  return raw.map((t, i) => {
    const n = i + 1;
    if (typeof t !== "object" || t === null) throw new Error(`第 ${n} 条任务格式错误`);
    const task = t as Record<string, unknown>;
    const day = Number(task.day);
    if (!Number.isInteger(day) || day < 1 || day > 7) {
      throw new Error(`第 ${n} 条任务 day 应为 1-7`);
    }
    if (typeof task.title !== "string" || !task.title.trim()) {
      throw new Error(`第 ${n} 条任务标题不能为空`);
    }
    if (typeof task.detail !== "string" || !task.detail.trim()) {
      throw new Error(`第 ${n} 条任务详情不能为空`);
    }
    const minutes = Number(task.minutes);
    if (!Number.isInteger(minutes) || minutes <= 0) {
      throw new Error(`第 ${n} 条任务预计分钟必须为正整数`);
    }
    return { day, title: task.title.trim(), detail: task.detail.trim(), minutes };
  });
}

function buildPrompt(tasks: WeekTaskInput[], instruction: string, dailyMinutes?: number): string {
  return `你是备考规划师。AI 曾为下周生成如下任务计划（JSON，day 1-7 对应周一到周日）：
${JSON.stringify(tasks, null, 2)}

用户提出修改指令：「${instruction}」

请输出修改后的完整任务列表，严格 JSON，结构必须与输入完全一致：
{"tasks":[{"day":1,"title":"具体任务","detail":"怎么做、做到什么程度","minutes":30}]}
要求：
1. 只按指令修改相关任务，未被指令触及的任务保持原样
2. 任务必须具体可执行${dailyMinutes ? `；同一天的多个任务 minutes 总和不得超过 ${dailyMinutes} 分钟` : ""}
3. day 保持 1-7`;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      tasks?: unknown;
      instruction?: string;
      dailyMinutes?: number;
    };

    let tasks: WeekTaskInput[];
    try {
      tasks = parseWeekTasks(body.tasks);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ code: 400, data: null, msg: message }, { status: 400 });
    }

    const instruction = body.instruction?.trim();
    if (!instruction) {
      return NextResponse.json({ code: 400, data: null, msg: "修改指令不能为空" }, { status: 400 });
    }

    const result = await chat({
      messages: [{ role: "user", content: buildPrompt(tasks, instruction, body.dailyMinutes) }],
      taskType: "complex",
      module: "备考周报",
      responseFormat: "json",
    });

    const parsed = JSON.parse(result.content) as { tasks?: unknown };
    const revised = parseWeekTasks(parsed.tasks);

    return NextResponse.json({ code: 0, data: { tasks: revised }, msg: "" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[companion/revise-week-tasks] failed:", message);
    return NextResponse.json({ code: 500, data: null, msg: message }, { status: 500 });
  }
}
