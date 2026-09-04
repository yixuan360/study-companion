import Link from "next/link";
import { prisma } from "@/lib/db";
import { BackLink } from "@/app/_components/BackLink";

export default async function MaterialsPage() {
  const materials = await prisma.material.findMany({
    orderBy: { createdAt: "desc" },
  });

  const cardCounts = await Promise.all(
    materials.map((m) => prisma.card.count({ where: { materialId: m.id } }))
  );

  return (
    <main className="min-h-svh bg-zinc-50 px-4 py-6 dark:bg-black sm:px-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6">
          <BackLink href="/recite">返回背诵模块</BackLink>
        </div>
        <div className="mb-6 flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">我的材料</h1>
          <Link
            href="/recite/import"
            className="shrink-0 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            录入新材料
          </Link>
        </div>

        {materials.length === 0 ? (
          <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">还没有材料，快去录入吧</p>
            <Link
              href="/recite/import"
              className="inline-flex rounded-xl bg-indigo-600 px-5 py-3 text-sm font-medium text-white hover:bg-indigo-700"
            >
              去录入
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {materials.map((material, index) => (
              <Link
                key={material.id}
                href={`/recite/materials/${material.id}`}
                className="block rounded-2xl border border-zinc-200 bg-white p-4 transition hover:border-indigo-300 hover:shadow-sm active:scale-[0.99] dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-indigo-900/50"
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
