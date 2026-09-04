"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BackLink } from "@/app/_components/BackLink";
import { resetCardsProgress } from "@/modules/recite/actions";
import type { Card, Material } from "@/generated/prisma/client";

const typeLabels: Record<string, string> = {
  cloze: "挖空",
  qa: "问答",
  judge: "判断",
};

const masteryLabels: Record<string, string> = {
  new: "未学",
  learning: "学习中",
  familiar: "较熟悉",
  mastered: "已掌握",
};

const masteryBadgeClass: Record<string, string> = {
  new: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  learning: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  familiar: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  mastered: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
};

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

export default function MaterialDetailClient({
  material,
  cards: initialCards,
}: {
  material: Material;
  cards: Card[];
}) {
  const router = useRouter();
  const [cards, setCards] = useState<Card[]>(initialCards);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  const masteryCounts = cards.reduce<Record<string, number>>((acc, card) => {
    acc[card.mastery] = (acc[card.mastery] ?? 0) + 1;
    return acc;
  }, {});

  async function handleDelete(cardId: string) {
    if (!confirm("确定删除这张卡片吗？")) return;
    setDeletingId(cardId);
    try {
      const res = await fetch(`/api/recite/cards/${cardId}`, { method: "DELETE" });
      const result = await res.json();
      if (result.code !== 0) throw new Error(result.msg || "删除失败");
      setCards(cards.filter((c) => c.id !== cardId));
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setDeletingId(null);
    }
  }

  async function handleResetProgress() {
    if (!confirm("确定重置复习进度？该材料所有卡片将回到今日待复习队列，复习历史保留。")) {
      return;
    }
    setResetting(true);
    try {
      await resetCardsProgress(material.id);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setResetting(false);
    }
  }

  return (
    <main className="min-h-svh bg-zinc-50 px-4 py-6 dark:bg-black sm:px-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center gap-3">
          <BackLink href="/recite/materials">返回材料列表</BackLink>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">{material.title}</h1>
        </div>

        {/* 操作区 */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <Link
            href={`/recite/review?materialId=${material.id}`}
            className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-indigo-700 active:scale-[0.98]"
          >
            开始背诵本材料
          </Link>
          <button
            onClick={handleResetProgress}
            disabled={resetting || cards.length === 0}
            className="rounded-xl border border-zinc-200 bg-white px-5 py-3 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            {resetting ? "重置中..." : "重置复习进度"}
          </button>
        </div>

        {/* 掌握度分布 */}
        {cards.length > 0 && (
          <div className="mb-6 flex flex-wrap gap-2">
            {Object.entries(masteryCounts).map(([mastery, count]) => (
              <span
                key={mastery}
                className={`rounded-full px-3 py-1 text-xs font-medium ${masteryBadgeClass[mastery] ?? ""}`}
              >
                {masteryLabels[mastery] ?? mastery} {count} 张
              </span>
            ))}
          </div>
        )}

        {cards.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">该材料下还没有卡片</p>
            <Link
              href="/recite/import"
              className="inline-flex rounded-xl bg-indigo-600 px-5 py-3 text-sm font-medium text-white hover:bg-indigo-700"
            >
              去录入
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {cards.map((card) => (
              <div
                key={card.id}
                className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                    {typeLabels[card.cardType] ?? card.cardType}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${masteryBadgeClass[card.mastery] ?? ""}`}
                  >
                    {masteryLabels[card.mastery] ?? card.mastery}
                  </span>
                  {card.lapseCount > 0 && (
                    <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
                      遗忘 {card.lapseCount} 次
                    </span>
                  )}
                  {card.mastery !== "new" && (
                    <span className="text-xs text-zinc-400 dark:text-zinc-500">
                      下次复习 {formatDate(card.nextReviewAt)}
                    </span>
                  )}
                </div>
                <p className="mb-1 text-sm font-medium text-zinc-900 dark:text-zinc-50">{card.question}</p>
                <p className="mb-2 text-sm text-zinc-600 dark:text-zinc-400">{card.answer}</p>
                {card.hint && (
                  <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-500">提示：{card.hint}</p>
                )}
                <div className="flex justify-end">
                  <button
                    onClick={() => handleDelete(card.id)}
                    disabled={deletingId === card.id}
                    className="rounded-lg px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-900/20"
                  >
                    {deletingId === card.id ? "删除中..." : "删除"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
