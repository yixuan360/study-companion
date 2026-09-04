"use client";

import { useActionState } from "react";
import {
  sendTestPushAction,
  updatePushKeyAction,
  type FormState,
} from "@/modules/classroom/actions";

const initialState: FormState = { error: "" };

const inputClass =
  "min-h-[44px] w-full rounded-xl border border-zinc-200 bg-white p-3 text-base text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50";

function Feedback({ state }: { state: FormState }) {
  if (state.error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
        {state.error}
      </div>
    );
  }
  if (state.success) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-300">
        {state.success}
      </div>
    );
  }
  return null;
}

export function SettingsForms({ pushKey }: { pushKey: string }) {
  const [saveState, saveAction, savePending] = useActionState(
    updatePushKeyAction,
    initialState
  );
  const [testState, testAction, testPending] = useActionState(
    sendTestPushAction,
    initialState
  );

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-1 font-semibold text-zinc-900 dark:text-zinc-50">
          绑定 Server酱 微信推送
        </h2>
        <p className="mb-4 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          获取教程：打开{" "}
          <a
            href="https://sct.ftqq.com/"
            target="_blank"
            rel="noreferrer"
            className="text-indigo-600 underline dark:text-indigo-400"
          >
            sct.ftqq.com
          </a>{" "}
          → 微信扫码登录 → 点击「SendKey」复制 SCT 开头的秘钥 → 粘贴到下面保存。
          绑定后，任务到期提醒会发到你的微信服务号。
        </p>
        <form action={saveAction} className="space-y-3">
          <input
            type="text"
            name="pushKey"
            defaultValue={pushKey}
            placeholder="SCT…（Server酱 Turbo SendKey）"
            className={`${inputClass} font-mono`}
          />
          <Feedback state={saveState} />
          <button
            type="submit"
            disabled={savePending}
            className="min-h-[44px] w-full rounded-xl bg-indigo-600 px-5 py-2.5 text-base font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {savePending ? "保存中..." : "保存 SendKey"}
          </button>
        </form>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-1 font-semibold text-zinc-900 dark:text-zinc-50">发送测试消息</h2>
        <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
          用上面已保存的 SendKey 发一条测试消息，确认微信能收到
        </p>
        <form action={testAction}>
          <Feedback state={testState} />
          {testState.success && <div className="h-3" />}
          <button
            type="submit"
            disabled={testPending}
            className="min-h-[44px] w-full rounded-xl border border-indigo-200 bg-indigo-50 px-5 py-2.5 text-base font-medium text-indigo-700 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-indigo-900/50 dark:bg-indigo-900/30 dark:text-indigo-300 dark:hover:bg-indigo-900/50"
          >
            {testPending ? "发送中..." : "发送测试消息"}
          </button>
        </form>
      </div>
    </div>
  );
}
