import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  GOAL_CATEGORIES,
  parsePlan,
  parseDateOnly,
  computePhaseDates,
  computeTaskDueDate,
  startOfToday,
  type GoalCategoryValue,
} from "@/modules/companion/plan";

export interface CreateGoalRequest {
  title: string;
  category: string;
  deadline: string;
  dailyMinutes: number;
  userContext: string;
  assessment?: string;
  phases: { name: string; weeks: number; focus: string; exitCriteria: string }[];
  week1Tasks: { day: number; title: string; detail: string; minutes: number }[];
}

function parseCategory(value: unknown): GoalCategoryValue {
  if (typeof value !== "string" || !GOAL_CATEGORIES.includes(value as GoalCategoryValue)) {
    throw new Error("目标类别无效");
  }
  return value as GoalCategoryValue;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<CreateGoalRequest>;

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

    let category: GoalCategoryValue;
    let deadline: Date;
    try {
      category = parseCategory(body.category);
      deadline = parseDateOnly(body.deadline, "截止日期");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ code: 400, data: null, msg: message }, { status: 400 });
    }

    // 复用生成接口的校验逻辑，保证入库数据与预览一致
    const plan = parsePlan({
      assessment: body.assessment ?? "用户已确认的计划",
      phases: body.phases,
      week1Tasks: body.week1Tasks,
    });

    const today = startOfToday();
    const phaseDates = computePhaseDates(plan.phases, today);
    let goalId = "";

    await prisma.$transaction(async (tx) => {
      const goal = await tx.goal.create({
        data: {
          title,
          category,
          deadline,
          dailyMinutes,
          userContext,
          metadata: {
            assessment: plan.assessment,
            planConfirmedAt: new Date().toISOString(),
          },
        },
      });
      goalId = goal.id;

      const createdPhases: { id: string }[] = [];
      for (let i = 0; i < plan.phases.length; i++) {
        const phase = plan.phases[i];
        createdPhases.push(
          await tx.phase.create({
            data: {
              goalId,
              name: phase.name,
              startDate: phaseDates[i].startDate,
              endDate: phaseDates[i].endDate,
              focus: phase.focus,
              order: i + 1,
              metadata: { exitCriteria: phase.exitCriteria },
            },
          })
        );
      }

      if (plan.week1Tasks.length > 0 && createdPhases.length > 0) {
        await tx.task.createMany({
          data: plan.week1Tasks.map((task) => ({
            goalId,
            phaseId: createdPhases[0].id,
            title: task.title,
            detail: task.detail,
            estMinutes: task.minutes,
            dueDate: computeTaskDueDate(task.day, today),
          })),
        });
      }
    });

    return NextResponse.json({ code: 0, data: { goalId }, msg: "" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[companion/goals] failed:", message);
    return NextResponse.json({ code: 500, data: null, msg: message }, { status: 500 });
  }
}
