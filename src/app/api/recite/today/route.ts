import { NextResponse } from "next/server";
import { getTodayReviewCards } from "@/modules/recite/today";

export async function GET() {
  try {
    const { dueCards, newCards, totalCount } = await getTodayReviewCards();

    return NextResponse.json({
      code: 0,
      data: {
        dueCards,
        newCards,
        totalCount,
      },
      msg: "",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[recite/today] failed:", message);
    return NextResponse.json({ code: 500, data: null, msg: message }, { status: 500 });
  }
}
