# 背诵模块文字录入到 AI 制卡实现计划

> **For agentic workers:** implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 `/recite/import` 文字录入、AI 制卡、预览确认、批量入库，以及 `/recite/materials` 与 `/recite/materials/[id]` 列表/详情页。

**Architecture:** 后端通过 `src/lib/ai` 网关统一调用 DeepSeek（simple 任务），返回 JSON 卡片数组；前端三步向导收集输入、展示预览、批量保存；所有数据操作通过 Prisma Client 完成。

**Tech Stack:** Next.js 16 App Router、React 19、TypeScript、Tailwind CSS 4、Prisma、SQLite。

## Global Constraints

- AI 调用必须走 `src/lib/ai` 网关，禁止直接调用大模型 API。
- 所有 API 路由统一返回 `{ code, data, msg }`。
- 移动端优先布局。
- 不改动 `prisma/schema.prisma`（模型已存在）。
- AI 生成内容必须经过用户预览确认后才能入库。

---

## Task 1: 实现 POST /api/recite/generate-cards

**Files:**
- Create: `src/app/api/recite/generate-cards/route.ts`

**Interfaces:**
- Consumes: `src/lib/ai` 的 `chat(options: ChatOptions)`；`src/lib/db` 的 `prisma`。
- Produces: API 返回 `{ code: 0, data: { materialId, cards, usage, model, provider }, msg }`。

- [ ] **Step 1: 创建路由文件并写入生成逻辑**

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { chat } from "@/lib/ai";

const MAX_CONTENT_LENGTH = 8000;

export interface GenerateCardsRequest {
  title: string;
  content: string;
}

export interface GeneratedCard {
  type: "cloze" | "qa" | "judge";
  question: string;
  answer: string;
  hint?: string;
}

function buildPrompt(content: string): string {
  return `你是学习卡片制作专家。将以下学习材料拆解为原子知识点，每个知识点生成一张记忆卡。
要求：
1. 一张卡只考一个知识点，问题明确无歧义
2. 题型分布：优先挖空题（cloze，针对关键概念/定义/公式/结论），其次简答题（qa），判断题（judge）少量
3. 挖空题用 ____ 表示空缺处
4. 忽略页码、装饰性文字
5. 输出严格 JSON：{"cards":[{"type":"cloze|qa|judge","question":"...","answer":"...","hint":"一句话提示，可省略"}]}
材料：
"""
${content}
"""`;
}

function parseCards(raw: unknown): GeneratedCard[] {
  if (typeof raw !== "object" || raw === null || !("cards" in raw)) {
    throw new Error("AI 返回格式错误，缺少 cards 字段");
  }
  const cards = (raw as { cards: unknown[] }).cards;
  if (!Array.isArray(cards)) {
    throw new Error("AI 返回的 cards 不是数组");
  }
  return cards.map((card, index) => {
    if (
      typeof card !== "object" ||
      card === null ||
      typeof (card as GeneratedCard).type !== "string" ||
      typeof (card as GeneratedCard).question !== "string" ||
      typeof (card as GeneratedCard).answer !== "string"
    ) {
      throw new Error(`第 ${index + 1} 张卡片字段不完整`);
    }
    return card as GeneratedCard;
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as GenerateCardsRequest;
    const title = body.title?.trim();
    const content = body.content?.trim();

    if (!title) {
      return NextResponse.json({ code: 400, data: null, msg: "标题不能为空" }, { status: 400 });
    }
    if (!content) {
      return NextResponse.json({ code: 400, data: null, msg: "内容不能为空" }, { status: 400 });
    }

    let truncated = false;
    let processedContent = content;
    if (content.length > MAX_CONTENT_LENGTH) {
      processedContent = content.slice(0, MAX_CONTENT_LENGTH);
      truncated = true;
    }

    const material = await prisma.material.create({
      data: {
        title,
        sourceType: "text",
        rawContent: processedContent,
      },
    });

    const result = await chat({
      messages: [{ role: "user", content: buildPrompt(processedContent) }],
      taskType: "simple",
      responseFormat: "json",
    });

    const cards = parseCards(JSON.parse(result.content));

    return NextResponse.json({
      code: 0,
      data: {
        materialId: material.id,
        cards,
        usage: result.usage,
        model: result.model,
        provider: result.provider,
      },
      msg: truncated ? "内容较长，已截断前 8000 字符，建议分段录入" : "",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[recite/generate-cards] failed:", message);
    return NextResponse.json({ code: 500, data: null, msg: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: 运行类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误。

---

## Task 2: 实现 POST /api/recite/cards/batch-create

**Files:**
- Create: `src/app/api/recite/cards/batch-create/route.ts`

**Interfaces:**
- Consumes: `src/lib/db` 的 `prisma`。
- Produces: API 返回 `{ code: 0, data: { savedCount }, msg: "" }`。

- [ ] **Step 1: 创建路由文件并写入批量保存逻辑**

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { CardType } from "@/generated/prisma/client";

export interface BatchCreateRequest {
  materialId: string;
  cards: {
    type: CardType;
    question: string;
    answer: string;
    hint?: string;
  }[];
}

const VALID_CARD_TYPES: CardType[] = ["cloze", "qa", "judge"];

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as BatchCreateRequest;
    const { materialId, cards } = body;

    if (!materialId || typeof materialId !== "string") {
      return NextResponse.json({ code: 400, data: null, msg: "materialId 不能为空" }, { status: 400 });
    }

    if (!Array.isArray(cards) || cards.length === 0) {
      return NextResponse.json({ code: 400, data: null, msg: "至少选择一张卡片" }, { status: 400 });
    }

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      if (!VALID_CARD_TYPES.includes(card.type)) {
        return NextResponse.json({ code: 400, data: null, msg: `第 ${i + 1} 张卡片题型不合法` }, { status: 400 });
      }
      if (typeof card.question !== "string" || card.question.trim().length === 0) {
        return NextResponse.json({ code: 400, data: null, msg: `第 ${i + 1} 张卡片题目不能为空` }, { status: 400 });
      }
      if (typeof card.answer !== "string" || card.answer.trim().length === 0) {
        return NextResponse.json({ code: 400, data: null, msg: `第 ${i + 1} 张卡片答案不能为空` }, { status: 400 });
      }
    }

    const material = await prisma.material.findUnique({ where: { id: materialId } });
    if (!material) {
      return NextResponse.json({ code: 404, data: null, msg: "材料不存在" }, { status: 404 });
    }

    const { count } = await prisma.card.createMany({
      data: cards.map((card) => ({
        materialId,
        question: card.question.trim(),
        answer: card.answer.trim(),
        hint: card.hint?.trim() || null,
        cardType: card.type,
      })),
    });

    return NextResponse.json({ code: 0, data: { savedCount: count }, msg: "" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[recite/cards/batch-create] failed:", message);
    return NextResponse.json({ code: 500, data: null, msg: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: 运行类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误。

---

## Task 3: 实现 /recite/import 录入页

**Files:**
- Create: `src/app/recite/import/page.tsx`

**Interfaces:**
- Consumes: `POST /api/recite/generate-cards` 和 `POST /api/recite/cards/batch-create`。
- Produces: 客户端页面组件，提供三步向导 UI。

- [ ] **Step 1: 创建页面文件并写入完整交互**

```tsx
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
```

- [ ] **Step 2: 运行类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误。

---

## Task 4: 实现 /recite/materials 材料列表页

**Files:**
- Create: `src/app/recite/materials/page.tsx`

**Interfaces:**
- Consumes: Prisma `material.findMany` 与 `card.count`。
- Produces: 服务端渲染页面，展示材料列表。

- [ ] **Step 1: 创建页面文件**

```tsx
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
```

- [ ] **Step 2: 运行类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误。

---

## Task 5: 实现 /recite/materials/[id] 卡片详情页

**Files:**
- Create: `src/app/recite/materials/[id]/page.tsx`
- Create: `src/app/api/recite/cards/[cardId]/route.ts`（用于删除单张卡）

**Interfaces:**
- Consumes: Prisma `material.findUnique`、`card.findMany`；客户端调用 `DELETE /api/recite/cards/[cardId]`。
- Produces: 展示材料标题与卡片列表，支持删除。

- [ ] **Step 1: 创建删除 API 路由**

```typescript
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
```

- [ ] **Step 2: 创建详情页**

```tsx
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

export default function MaterialDetailPage({
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
```

- [ ] **Step 3: 添加数据获取（保持同文件或拆分为独立函数）**

由于 Next.js App Router 页面组件默认是服务端组件，但删除需要客户端状态。推荐方案：

```tsx
// 在同文件中导出异步页面组件
async function fetchMaterial(id: string) {
  const material = await prisma.material.findUnique({ where: { id } });
  const cards = await prisma.card.findMany({
    where: { materialId: id },
    orderBy: { createdAt: "desc" },
  });
  return { material, cards };
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { material, cards } = await fetchMaterial(id);
  if (!material) {
    return (
      <main className="min-h-screen px-4 py-6">
        <p>材料不存在</p>
      </main>
    );
  }
  return <MaterialDetailPage material={material} cards={cards} />;
}
```

但上述方案会把客户端组件作为子组件。完整文件应将服务端获取与客户端展示合并，如下：

```tsx
// src/app/recite/materials/[id]/page.tsx 完整结构
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { MaterialDetailClient } from "./MaterialDetailClient";

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
```

同时创建 `src/app/recite/materials/[id]/MaterialDetailClient.tsx` 作为客户端组件，内容为上面 Step 2 的组件。

- [ ] **Step 4: 运行类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误。

---

## Task 6: 更新 AGENTS.md

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: 在「已完成清单」新增条目**

```markdown
- [x] 背诵模块核心链路：/recite/import 录入页、AI 制卡、预览确认、批量入库。
- [x] API POST /api/recite/generate-cards 与 POST /api/recite/cards/batch-create。
- [x] 材料列表页 /recite/materials 与材料详情/卡片列表页 /recite/materials/[id]。
```

- [ ] **Step 2: 更新「目录结构」中 src/app 与 src/modules/recite 说明**

在目录结构中补充新增文件路径，并在模块划分中说明背诵模块已包含 import、materials、materials/[id] 页面及对应 API。

---

## Task 7: 验证

- [ ] **Step 1: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误。

- [ ] **Step 2: ESLint 检查**

Run: `npm run lint`
Expected: 无错误（或仅既有警告）。

- [ ] **Step 3: 启动开发服务器并手动测试**

Run: `npm run dev`

测试路径：
1. 访问 `/recite/import`，输入标题和内容，点击"开始制卡"。
2. 预览区展示卡片，测试全选/反选、编辑、删除。
3. 点击"确认保存 N 张卡"，确认跳转至 `/recite/materials/[id]`。
4. 访问 `/recite/materials`，确认材料列表正确。
5. 进入详情页，删除单张卡并刷新确认。

---

## 自检结果

- **Spec coverage:** 所有需求点均已对应到任务。
- **Placeholder scan:** 无 TBD/TODO/"实现 later" 等占位。
- **Type consistency:** 使用 Prisma 生成的 `CardType`，API 与页面类型一致。
