"use client";

import { useState } from "react";
import Link from "next/link";
import { BackLink } from "@/app/_components/BackLink";
import type { GraphExtraction } from "@/modules/graph/extract";

interface IngestResult {
  sourceId: string;
  newNodes: number;
  reusedNodes: number;
  newEdges: number;
  incrementedEdges: number;
  conflicts: number;
  skippedRelations: number;
}

type Phase = "input" | "preview" | "done";

function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

const inputClass =
  "w-full rounded-xl border border-zinc-200 bg-white p-3 text-base text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50";

export default function GraphImportPage() {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [extraction, setExtraction] = useState<GraphExtraction | null>(null);
  const [deletedEntities, setDeletedEntities] = useState<Set<string>>(new Set());
  const [deletedRelations, setDeletedRelations] = useState<Set<number>>(new Set());
  const [phase, setPhase] = useState<Phase>("input");
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<IngestResult | null>(null);

  async function handleExtract() {
    setError("");
    setNotice("");
    setExtracting(true);
    try {
      const res = await fetch("/api/graph/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content }),
      });
      const json = (await res.json()) as {
        code: number;
        data: { extraction: GraphExtraction; truncated: boolean } | null;
        msg: string;
      };
      if (json.code !== 0 || !json.data) {
        throw new Error(json.msg || "提取失败");
      }
      setExtraction(json.data.extraction);
      setDeletedEntities(new Set());
      setDeletedRelations(new Set());
      setPhase("preview");
      if (json.data.truncated) setNotice(json.msg);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExtracting(false);
    }
  }

  async function handleIngest() {
    if (!extraction) return;
    setError("");
    setSaving(true);
    try {
      const activeEntities = extraction.entities.filter(
        (e) => !deletedEntities.has(e.name)
      );
      const activeNames = new Set(activeEntities.map((e) => e.name.toLowerCase()));
      const relations = extraction.relations.filter(
        (r, i) =>
          !deletedRelations.has(i) &&
          activeNames.has(r.from.toLowerCase()) &&
          activeNames.has(r.to.toLowerCase())
      );
      const res = await fetch("/api/graph/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          content,
          extracted: { domain: extraction.domain, entities: activeEntities, relations },
        }),
      });
      const json = (await res.json()) as {
        code: number;
        data: IngestResult | null;
        msg: string;
      };
      if (json.code !== 0 || !json.data) {
        throw new Error(json.msg || "入库失败");
      }
      setResult(json.data);
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setTitle("");
    setContent("");
    setExtraction(null);
    setDeletedEntities(new Set());
    setDeletedRelations(new Set());
    setPhase("input");
    setResult(null);
    setError("");
    setNotice("");
  }

  const activeEntityNames = extraction
    ? new Set(
        extraction.entities
          .filter((e) => !deletedEntities.has(e.name))
          .map((e) => e.name.toLowerCase())
      )
    : new Set();
  const activeEntityCount = extraction
    ? extraction.entities.length - deletedEntities.size
    : 0;
  const activeRelationCount = extraction
    ? extraction.relations.filter(
        (r, i) =>
          !deletedRelations.has(i) &&
          activeEntityNames.has(r.from.toLowerCase()) &&
          activeEntityNames.has(r.to.toLowerCase())
      ).length
    : 0;

  return (
    <main className="min-h-svh bg-zinc-50 px-4 py-6 pb-28 dark:bg-black sm:px-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6">
          <BackLink href="/graph">返回图谱</BackLink>
        </div>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">喂入知识</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            粘贴文章或笔记，AI 提炼知识点和关联，存入你的个人图谱
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
            {error}
          </div>
        )}
        {notice && (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-300">
            {notice}
          </div>
        )}

        {phase === "done" && result ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center dark:border-emerald-900/50 dark:bg-emerald-900/20">
              <div className="mb-2 text-4xl">🌱</div>
              <h2 className="mb-1 text-lg font-semibold text-emerald-800 dark:text-emerald-200">
                已存入图谱
              </h2>
              <p className="text-sm text-emerald-700 dark:text-emerald-300">
                新增 {result.newNodes} 个知识点，复用 {result.reusedNodes} 个，
                新增 {result.newEdges} 条关联
                {result.incrementedEdges > 0 && `（${result.incrementedEdges} 条已有关联权重+1）`}
              </p>
              {result.conflicts > 0 && (
                <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
                  ⚠ 检测到 {result.conflicts} 条疑似冲突的关系，已进入
                  <Link href="/graph/review" className="underline">
                    审阅队列
                  </Link>
                </p>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={reset}
                className="min-h-[44px] flex-1 rounded-xl border border-zinc-200 bg-white px-5 py-3 text-base font-medium text-zinc-700 transition hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
              >
                继续喂入
              </button>
              <Link
                href="/graph"
                className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-indigo-600 px-5 py-3 text-base font-medium text-white transition hover:bg-indigo-700"
              >
                查看图谱
              </Link>
            </div>
          </div>
        ) : phase === "input" ? (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                标题
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例如：CNN 笔记 / 四级听力技巧"
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                内容
              </label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={12}
                placeholder="粘贴文章、笔记、讲义原文..."
                className={inputClass}
              />
            </div>
            <button
              onClick={handleExtract}
              disabled={extracting || !title.trim() || !content.trim()}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3.5 text-base font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {extracting && <Spinner />}
              {extracting ? "AI 提炼中..." : "提炼知识"}
            </button>
          </div>
        ) : extraction ? (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                提炼结果预览
              </h2>
              <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-medium text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
                领域：{extraction.domain}
              </span>
            </div>

            <section>
              <h3 className="mb-2 text-sm font-medium text-zinc-500 dark:text-zinc-400">
                知识点（{activeEntityCount}）
              </h3>
              <div className="space-y-2">
                {extraction.entities.map((entity) => {
                  const deleted = deletedEntities.has(entity.name);
                  return (
                    <div
                      key={entity.name}
                      className={`flex items-start justify-between gap-3 rounded-xl border p-3 ${
                        deleted
                          ? "border-zinc-200 bg-zinc-50 opacity-50 dark:border-zinc-800 dark:bg-zinc-900/50"
                          : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                      }`}
                    >
                      <div className="min-w-0">
                        <p
                          className={`text-sm font-medium ${
                            deleted
                              ? "line-through"
                              : "text-zinc-900 dark:text-zinc-50"
                          }`}
                        >
                          {entity.name}
                        </p>
                        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                          {entity.summary}
                        </p>
                        {entity.aliases.length > 0 && (
                          <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
                            别名：{entity.aliases.join(" / ")}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() =>
                          setDeletedEntities((prev) => {
                            const next = new Set(prev);
                            if (next.has(entity.name)) {
                              next.delete(entity.name);
                            } else {
                              next.add(entity.name);
                            }
                            return next;
                          })
                        }
                        className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                      >
                        {deleted ? "恢复" : "删除"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-sm font-medium text-zinc-500 dark:text-zinc-400">
                关联（{activeRelationCount}）
              </h3>
              <div className="space-y-2">
                {extraction.relations.map((rel, i) => {
                  const deleted = deletedRelations.has(i);
                  const endpointMissing =
                    !activeEntityNames.has(rel.from.toLowerCase()) ||
                    !activeEntityNames.has(rel.to.toLowerCase());
                  return (
                    <div
                      key={i}
                      className={`flex items-start justify-between gap-3 rounded-xl border p-3 ${
                        deleted || endpointMissing
                          ? "border-zinc-200 bg-zinc-50 opacity-50 dark:border-zinc-800 dark:bg-zinc-900/50"
                          : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm text-zinc-900 dark:text-zinc-50">
                          <span className="font-medium">{rel.from}</span>
                          <span className="mx-2 rounded bg-violet-100 px-1.5 py-0.5 text-xs text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
                            {rel.relation}
                          </span>
                          <span className="font-medium">{rel.to}</span>
                        </p>
                        {rel.evidence && (
                          <p className="mt-0.5 line-clamp-2 text-xs text-zinc-400 dark:text-zinc-500">
                            依据：{rel.evidence}
                          </p>
                        )}
                        {endpointMissing && !deleted && (
                          <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">
                            端点知识点已删除，发布时将跳过
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() =>
                          setDeletedRelations((prev) => {
                            const next = new Set(prev);
                            if (next.has(i)) {
                              next.delete(i);
                            } else {
                              next.add(i);
                            }
                            return next;
                          })
                        }
                        className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                      >
                        {deleted ? "恢复" : "删除"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>

            <div className="flex gap-3">
              <button
                onClick={() => setPhase("input")}
                className="min-h-[44px] rounded-xl border border-zinc-200 bg-white px-5 py-3 text-base font-medium text-zinc-700 transition hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
              >
                返回修改
              </button>
              <button
                onClick={handleIngest}
                disabled={saving || activeEntityCount === 0}
                className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-base font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving && <Spinner />}
                {saving
                  ? "合并入库中..."
                  : `确认存入图谱（${activeEntityCount} 知识点 / ${activeRelationCount} 关联）`}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
