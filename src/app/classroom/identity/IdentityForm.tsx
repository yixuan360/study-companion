"use client";

import { useActionState } from "react";
import { createIdentityAction, type FormState } from "@/modules/classroom/actions";

const initialState: FormState = { error: "" };

export default function IdentityForm({ inviteCode }: { inviteCode?: string }) {
  const [state, formAction, pending] = useActionState(
    createIdentityAction,
    initialState
  );

  const inputClass =
    "w-full rounded-xl border border-zinc-200 bg-white p-3 text-base text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50";

  return (
    <form action={formAction} className="space-y-4">
      {inviteCode && <input type="hidden" name="code" value={inviteCode} />}
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          昵称 <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          name="name"
          required
          maxLength={20}
          placeholder="例如：小王 / 3号床学霸"
          className={inputClass}
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          学号（选填）
        </label>
        <input
          type="text"
          name="studentNo"
          maxLength={20}
          placeholder="例如：2024010101"
          className={inputClass}
        />
      </div>

      {state.error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
          {state.error}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="flex min-h-[44px] w-full items-center justify-center rounded-xl bg-indigo-600 px-5 py-3 text-base font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "创建中..." : "进入班级模块"}
      </button>
    </form>
  );
}
