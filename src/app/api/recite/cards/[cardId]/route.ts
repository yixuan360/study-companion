import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function DELETE(_request: Request, { params }: { params: Promise<{ cardId: string }> }) {
  try {
    const { cardId } = await params;
    await prisma.card.delete({ where: { id: cardId } });
    return NextResponse.json({ code: 0, data: null, msg: "" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[recite/cards/delete] failed:", message);
    return NextResponse.json({ code: 500, data: null, msg: message }, { status: 500 });
  }
}
