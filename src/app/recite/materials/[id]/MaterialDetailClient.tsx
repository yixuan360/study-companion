"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Card, Material } from "@/generated/prisma/client";

const typeLabels: Record<string, string> = {
  cloze: "挖空",
  qa: "问答",
  judge: "判断",
};

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

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-6 dark:bg-black sm:px-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center gap-3">
          <Link
            href="/recite/materials"
            className="rounded-lg px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            ← 返回
          </Link>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">{material.title}</h1>
        </div>

        {cards.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">该材料下还没有卡片</p>
          </div>
        ) : (
          <div className="space-y-3">
            {cards.map((card) => (
              <div
                key={card.id}
                className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="mb-2 flex items-center gap-2">
                  <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                    {typeLabels[card.cardType] ?? card.cardType}
                  </span>
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
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-900/20"
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
