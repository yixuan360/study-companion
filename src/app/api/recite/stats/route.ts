import { NextResponse } from "next/server";
import { getReviewStats } from "@/modules/recite/stats";

export async function GET() {
  try {
    const stats = await getReviewStats();
    return NextResponse.json({ code: 0, data: stats, msg: "" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[recite/stats] failed:", message);
    return NextResponse.json({ code: 500, data: null, msg: message }, { status: 500 });
  }
}
