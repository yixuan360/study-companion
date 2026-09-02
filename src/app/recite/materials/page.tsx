import Link from "next/link";
import { prisma } from "@/lib/db";

export default async function MaterialsPage() {
  const materials = await prisma.material.findMany({
    orderBy: { createdAt: "desc" },
  });

  const cardCounts = await Promise.all(
    materials.map((m) => prisma.card.count({ where: { materialId: m.id } }))
  );

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-6 dark:bg-black sm:px-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">我的材料</h1>
          <Link
            href="/recite/import"
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            录入新材料
          </Link>
        </div>

        {materials.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">还没有材料，快去录入吧</p>
          </div>
        ) : (
          <div className="space-y-3">
            {materials.map((material, index) => (
              <Link
                key={material.id}
                href={`/recite/materials/${material.id}`}
                className="block rounded-xl border border-zinc-200 bg-white p-4 transition hover:border-indigo-300 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-indigo-900/50"
              >
                <h2 className="mb-1 font-semibold text-zinc-900 dark:text-zinc-50">{material.title}</h2>
                <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                  <span>{cardCounts[index]} 张卡片</span>
                  <span>{material.createdAt.toLocaleString("zh-CN")}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
