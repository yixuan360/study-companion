import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const byModel = await prisma.apiLog.groupBy({
      by: ["provider", "model", "taskType"],
      where: { success: true },
      _sum: {
        promptTokens: true,
        completionTokens: true,
        totalTokens: true,
      },
      _count: {
        id: true,
      },
      _avg: {
        durationMs: true,
      },
    });

    const overall = await prisma.apiLog.aggregate({
      where: { success: true },
      _sum: {
        promptTokens: true,
        completionTokens: true,
        totalTokens: true,
      },
      _count: {
        id: true,
      },
    });

    return NextResponse.json({
      code: 0,
      data: {
        total: {
          calls: overall._count.id,
          promptTokens: overall._sum.promptTokens ?? 0,
          completionTokens: overall._sum.completionTokens ?? 0,
          totalTokens: overall._sum.totalTokens ?? 0,
        },
        byModel: byModel.map((row) => ({
          provider: row.provider,
          model: row.model,
          taskType: row.taskType,
          calls: row._count.id,
          promptTokens: row._sum.promptTokens ?? 0,
          completionTokens: row._sum.completionTokens ?? 0,
          totalTokens: row._sum.totalTokens ?? 0,
          avgDurationMs: row._avg.durationMs ?? 0,
        })),
      },
      msg: "",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[admin/ai-stats] failed:", message);
    return NextResponse.json(
      {
        code: 500,
        data: null,
        msg: message,
      },
      { status: 500 }
    );
  }
}
