import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import MaterialDetailClient from "./MaterialDetailClient";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const material = await prisma.material.findUnique({ where: { id } });
  if (!material) notFound();
  const cards = await prisma.card.findMany({
    where: { materialId: id },
    orderBy: { createdAt: "desc" },
  });
  return <MaterialDetailClient material={material} cards={cards} />;
}
