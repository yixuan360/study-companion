import { NextResponse } from "next/server";
import { getTodayReviewCards } from "@/modules/recite/today";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const materialId = url.searchParams.get("materialId")?.trim() || undefined;
    const limitParam = url.searchParams.get("dailyNewCardLimit");
    const dailyNewCardLimit = limitParam ? parseInt(limitParam, 10) : undefined;

    if (dailyNewCardLimit !== undefined && (!Number.isFinite(dailyNewCardLimit) || dailyNewCardLimit < 1)) {
      return NextResponse.json(
        { code: 400, data: null, msg: "dailyNewCardLimit 必须是正整数" },
        { status: 400 }
      );
    }

    const { dueCards, newCards, totalCount, materials } = await getTodayReviewCards({
      materialId,
      dailyNewCardLimit,
    });

    return NextResponse.json({
      code: 0,
      data: {
        dueCards,
        newCards,
        totalCount,
        materials,
      },
      msg: "",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[recite/today] failed:", message);
    return NextResponse.json({ code: 500, data: null, msg: message }, { status: 500 });
  }
}
