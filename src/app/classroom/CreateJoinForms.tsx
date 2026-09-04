"use client";

import { useActionState } from "react";
import {
  createClassroomAction,
  joinClassroomAction,
  type FormState,
} from "@/modules/classroom/actions";

const initialState: FormState = { error: "" };

const inputClass =
  "min-h-[44px] w-full rounded-xl border border-zinc-200 bg-white p-3 text-base text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50";

function FormError({ error }: { error: string }) {
  if (!error) return null;
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
      {error}
    </div>
  );
}

export function CreateJoinForms() {
  const [createState, createAction, createPending] = useActionState(
    createClassroomAction,
    initialState
  );
  const [joinState, joinAction, joinPending] = useActionState(
    joinClassroomAction,
    initialState
  );

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <form action={createAction} className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h3 className="font-semibold text-zinc-900 dark:text-zinc-50">创建班级</h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          创建后把邀请码分享给同学
        </p>
        <input
          type="text"
          name="name"
          required
          maxLength={30}
          placeholder="班级名，如：软件2401班"
          className={inputClass}
        />
        <FormError error={createState.error} />
        <button
          type="submit"
          disabled={createPending}
          className="min-h-[44px] w-full rounded-xl bg-emerald-600 px-5 py-2.5 text-base font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {createPending ? "创建中..." : "+ 创建班级"}
        </button>
      </form>

      <form action={joinAction} className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h3 className="font-semibold text-zinc-900 dark:text-zinc-50">加入班级</h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          输入同学分享给你的 8 位邀请码
        </p>
        <input
          type="text"
          name="inviteCode"
          required
          maxLength={8}
          autoCapitalize="characters"
          placeholder="如：A7K2M9PQ"
          className={`${inputClass} font-mono tracking-widest uppercase`}
        />
        <FormError error={joinState.error} />
        <button
          type="submit"
          disabled={joinPending}
          className="min-h-[44px] w-full rounded-xl bg-indigo-600 px-5 py-2.5 text-base font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {joinPending ? "加入中..." : "加入班级"}
        </button>
      </form>
    </div>
  );
}
