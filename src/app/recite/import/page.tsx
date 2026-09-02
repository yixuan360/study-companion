"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface GeneratedCard {
  type: "cloze" | "qa" | "judge";
  question: string;
  answer: string;
  hint?: string;
}

interface ApiResponse<T> {
  code: number;
  data: T | null;
  msg: string;
}

const typeLabels: Record<string, string> = {
  cloze: "挖空",
  qa: "问答",
  judge: "判断",
};

export default function ReciteImportPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [materialId, setMaterialId] = useState<string | null>(null);
  const [cards, setCards] = useState<(GeneratedCard & { id: string; selected: boolean })[]>([]);
  const [saving, setSaving] = useState(false);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setWarning("");
    setLoading(true);

    try {
      const res = await fetch("/api/recite/generate-cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content }),
      });
      const result = (await res.json()) as ApiResponse<{
        materialId: string;
        cards: GeneratedCard[];
      }>;

      if (result.code !== 0 || !result.data) {
        throw new Error(result.msg || "制卡失败");
      }

      setMaterialId(result.data.materialId);
      setCards(
        result.data.cards.map((card, index) => ({
          ...card,
          id: `${index}-${Date.now()}`,
          selected: true,
        }))
      );
      if (result.msg) setWarning(result.msg);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  function toggleAll() {
    const allSelected = cards.every((c) => c.selected);
    setCards(cards.map((c) => ({ ...c, selected: !allSelected })));
  }

  function toggleOne(id: string) {
    setCards(cards.map((c) => (c.id === id ? { ...c, selected: !c.selected } : c)));
  }

  function updateCard(id: string, field: keyof GeneratedCard, value: string) {
    setCards(cards.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
  }

  function deleteCard(id: string) {
    setCards(cards.filter((c) => c.id !== id));
  }

  async function handleSave() {
    if (!materialId) return;
    const selected = cards.filter((c) => c.selected);
    if (selected.length === 0) return;

    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/recite/cards/batch-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          materialId,
          cards: selected.map((c) => ({
            type: c.type,
            question: c.question,
            answer: c.answer,
            hint: c.hint,
          })),
        }),
      });
      const result = (await res.json()) as ApiResponse<{ savedCount: number }>;
      if (result.code !== 0) {
        throw new Error(result.msg || "保存失败");
      }
      router.push(`/recite/materials/${materialId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  const selectedCount = cards.filter((c) => c.selected).length;

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-6 dark:bg-black sm:px-6">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-6 text-2xl font-bold text-zinc-900 dark:text-zinc-50">录入新材料</h1>

        <form onSubmit={handleGenerate} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">标题</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：计算机网络第一章"
              disabled={loading || cards.length > 0}
              className="w-full rounded-xl border border-zinc-200 bg-white p-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">学习内容</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={12}
              placeholder="在此粘贴笔记、讲义或课本内容..."
              disabled={loading || cards.length > 0}
              className="w-full rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </div>
          {warning && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-300">
              {warning}
            </div>
          )}
          {cards.length === 0 && (
            <button
              type="submit"
              disabled={loading || !title.trim() || !content.trim()}
              className="w-full rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              {loading ? "制卡中..." : "开始制卡"}
            </button>
          )}
        </form>

        {error && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
            <p className="font-medium">出错了</p>
            <pre className="mt-2 whitespace-pre-wrap">{error}</pre>
          </div>
        )}

        {cards.length > 0 && (
          <div className="mt-8 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                共生成 {cards.length} 张卡
              </h2>
              <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={cards.length > 0 && cards.every((c) => c.selected)}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                />
                全选/反选
              </label>
            </div>

            <div className="space-y-3">
              {cards.map((card) => (
                <CardPreview
                  key={card.id}
                  card={card}
                  onToggle={() => toggleOne(card.id)}
                  onUpdate={(field, value) => updateCard(card.id, field, value)}
                  onDelete={() => deleteCard(card.id)}
                />
              ))}
            </div>

            <div className="sticky bottom-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <button
                onClick={handleSave}
                disabled={saving || selectedCount === 0}
                className="w-full rounded-xl bg-emerald-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "保存中..." : `确认保存 ${selectedCount} 张卡`}
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function CardPreview({
  card,
  onToggle,
  onUpdate,
  onDelete,
}: {
  card: GeneratedCard & { id: string; selected: boolean };
  onToggle: () => void;
  onUpdate: (field: keyof GeneratedCard, value: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <div className={`rounded-xl border p-4 transition ${card.selected ? "border-indigo-200 bg-white dark:border-indigo-900/30 dark:bg-zinc-900" : "border-zinc-200 bg-zinc-50 opacity-70 dark:border-zinc-800 dark:bg-zinc-900/50"}`}>
      <div className="mb-3 flex items-start gap-3">
        <input
          type="checkbox"
          checked={card.selected}
          onChange={onToggle}
          className="mt-1 h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
        />
        <div className="flex-1">
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
              {typeLabels[card.type] ?? card.type}
            </span>
          </div>
          {editing ? (
            <div className="space-y-2">
              <textarea
                value={card.question}
                onChange={(e) => onUpdate("question", e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-zinc-200 bg-white p-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
              <textarea
                value={card.answer}
                onChange={(e) => onUpdate("answer", e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-zinc-200 bg-white p-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
              <input
                type="text"
                value={card.hint || ""}
                onChange={(e) => onUpdate("hint", e.target.value)}
                placeholder="提示（可选）"
                className="w-full rounded-lg border border-zinc-200 bg-white p-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
            </div>
          ) : (
            <div className="space-y-1 text-sm">
              <p className="font-medium text-zinc-900 dark:text-zinc-50">{card.question}</p>
              <p className="text-zinc-600 dark:text-zinc-400">{card.answer}</p>
              {card.hint && <p className="text-xs text-zinc-500 dark:text-zinc-500">提示：{card.hint}</p>}
            </div>
          )}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button
          onClick={() => setEditing(!editing)}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          {editing ? "完成" : "编辑"}
        </button>
        <button
          onClick={onDelete}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
        >
          删除
        </button>
      </div>
    </div>
  );
}
