"use client";

import { useState } from "react";
import { extractKeyPoints, type ExtractResult } from "./actions";

export default function AiTestPage() {
  const [text, setText] = useState("");
  const [result, setResult] = useState<ExtractResult | null>(null);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setResult(null);
    setLoading(true);

    try {
      const data = await extractKeyPoints(text);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8 dark:bg-black sm:px-6">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-2 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          AI 网关调试页
        </h1>
        <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
          输入任意文本，调用 AI 网关提取要点并返回 JSON。
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            placeholder="在此粘贴一段文字..."
            className="w-full rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
          />
          <button
            type="submit"
            disabled={loading || !text.trim()}
            className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "调用中..." : "提取要点"}
          </button>
        </form>

        {error && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
            <p className="font-medium">调用失败</p>
            <pre className="mt-2 whitespace-pre-wrap">{error}</pre>
          </div>
        )}

        {result && (
          <div className="mt-6 space-y-4">
            <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                模型信息
              </h2>
              <div className="grid grid-cols-2 gap-2 text-sm text-zinc-600 dark:text-zinc-400 sm:grid-cols-4">
                <div>
                  <span className="text-zinc-400">Provider</span>
                  <p className="font-medium text-zinc-900 dark:text-zinc-50">
                    {result.provider}
                  </p>
                </div>
                <div>
                  <span className="text-zinc-400">Model</span>
                  <p className="font-medium text-zinc-900 dark:text-zinc-50">
                    {result.model}
                  </p>
                </div>
                <div>
                  <span className="text-zinc-400">Total Tokens</span>
                  <p className="font-medium text-zinc-900 dark:text-zinc-50">
                    {result.usage.totalTokens}
                  </p>
                </div>
                <div>
                  <span className="text-zinc-400">Prompt / Completion</span>
                  <p className="font-medium text-zinc-900 dark:text-zinc-50">
                    {result.usage.promptTokens} / {result.usage.completionTokens}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                提取结果
              </h2>
              <pre className="overflow-auto rounded-lg bg-zinc-100 p-3 text-xs text-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
                {JSON.stringify(result.content, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
