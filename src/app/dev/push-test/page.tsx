"use client";

import { useState } from "react";
import { sendPushTest, type PushTestResult } from "./actions";

export default function PushTestPage() {
  const [result, setResult] = useState<PushTestResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    setResult(null);

    try {
      const data = await sendPushTest();
      setResult(data);
    } catch (err) {
      setResult({
        success: false,
        error: err instanceof Error ? err.message : String(err),
        sentAt: new Date().toLocaleString("zh-CN"),
        configured: false,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8 dark:bg-black sm:px-6">
      <div className="mx-auto max-w-xl">
        <h1 className="mb-2 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          推送网关调试页
        </h1>
        <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
          点击按钮向当前配置的 SendKey 发送一条测试消息。
        </p>

        <button
          type="button"
          onClick={handleClick}
          disabled={loading}
          className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "发送中..." : "发送测试推送"}
        </button>

        {result && (
          <div
            className={`mt-6 rounded-xl border p-4 text-sm ${
              result.success
                ? "border-green-200 bg-green-50 text-green-700 dark:border-green-900/50 dark:bg-green-900/20 dark:text-green-300"
                : "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300"
            }`}
          >
            <p className="font-medium">
              {result.success ? "推送成功" : "推送失败"}
            </p>
            <p className="mt-1">发送时间：{result.sentAt}</p>
            {!result.configured && (
              <p className="mt-1">
                环境变量状态：未配置 SERVER_CHAN_SEND_KEY，请检查 .env 并重启开发服务器。
              </p>
            )}
            {result.configured && result.keyHint && (
              <p className="mt-1">SendKey：{result.keyHint}</p>
            )}
            {result.error && (
              <pre className="mt-2 whitespace-pre-wrap">{result.error}</pre>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
