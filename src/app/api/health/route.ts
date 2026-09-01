import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const user = await prisma.user.create({
    data: { name: "health-check" },
  });
  const count = await prisma.user.count();
  await prisma.user.delete({ where: { id: user.id } });

  return NextResponse.json({
    ok: true,
    db: "sqlite",
    userCount: count,
    checkedAt: new Date().toISOString(),
  });
}
