"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Card } from "@/generated/prisma/client";

type ReviewResult = "forgot" | "hard" | "good" | "easy";

interface TodayResponse {
  code: number;
  data: {
    dueCards: Card[];
    newCards: Card[];
    totalCount: number;
  } | null;
  msg: string;
}

const resultButtons: { result: ReviewResult; label: string; colorClass: string; bgClass: string }[] = [
  {
    result: "forgot",
    label: "忘了",
    colorClass: "text-rose-700 dark:text-rose-300",
    bgClass: "bg-rose-100 hover:bg-rose-200 active:bg-rose-300 dark:bg-rose-900/40 dark:hover:bg-rose-900/60",
  },
  {
    result: "hard",
    label: "困难",
    colorClass: "text-amber-700 dark:text-amber-300",
    bgClass: "bg-amber-100 hover:bg-amber-200 active:bg-amber-300 dark:bg-amber-900/40 dark:hover:bg-amber-900/60",
  },
  {
    result: "good",
    label: "记得",
    colorClass: "text-emerald-700 dark:text-emerald-300",
    bgClass: "bg-emerald-100 hover:bg-emerald-200 active:bg-emerald-300 dark:bg-emerald-900/40 dark:hover:bg-emerald-900/60",
  },
  {
    result: "easy",
    label: "简单",
    colorClass: "text-sky-700 dark:text-sky-300",
    bgClass: "bg-sky-100 hover:bg-sky-200 active:bg-sky-300 dark:bg-sky-900/40 dark:hover:bg-sky-900/60",
  },
];

function normalizeCloze(question: string): string {
  // 把 Anki 格式 {{c1::答案}} 替换为 ____
  return question.replace(/\{\{c\d+::([^}]+)\}\}/g, "____");
}

function renderQuestion(question: string) {
  const text = normalizeCloze(question);
  const parts = text.split("____");
  if (parts.length === 1) {
    return <p className="text-lg font-medium leading-relaxed text-zinc-900 dark:text-zinc-50">{text}</p>;
  }
  return (
    <p className="text-lg font-medium leading-relaxed text-zinc-900 dark:text-zinc-50">
      {parts.map((part, index) => (
        <span key={index}>
          {part}
          {index < parts.length - 1 && (
            <span className="mx-1 inline-block rounded bg-indigo-100 px-2 py-0.5 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
              ____
            </span>
          )}
        </span>
      ))}
    </p>
  );
}

function getEncouragement(forgotCount: number, totalCount: number): string {
  if (totalCount === 0) return "今天没有待复习卡片，去录入新材料吧！";
  if (forgotCount === 0) return "太棒了，全部记得！继续保持。";
  if (forgotCount <= totalCount / 3) return "整体不错，忘记的卡片下次会再见到。";
  return "遗忘是记忆的一部分，多复习几次就会牢牢记住。";
}

export default function ReviewPage() {
  const [cards, setCards] = useState<Card[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [userAnswer, setUserAnswer] = useState("");
  const [judgePick, setJudgePick] = useState<boolean | null>(null);
  const [completedCount, setCompletedCount] = useState(0);
  const [forgotCount, setForgotCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/recite/today")
      .then((res) => res.json())
      .then((result: TodayResponse) => {
        if (result.code !== 0 || !result.data) {
          throw new Error(result.msg || "加载失败");
        }
        const allCards = [...result.data.dueCards, ...result.data.newCards];
        setCards(allCards);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
  }, []);

  const currentCard = cards[currentIndex];
  const totalCount = cards.length;
  const progressLabel = `${Math.min(completedCount + 1, totalCount)} / ${totalCount}`;
  const progressPercent = totalCount === 0 ? 0 : (completedCount / totalCount) * 100;

  const isJudgeCorrect = useMemo(() => {
    if (currentCard?.cardType !== "judge" || judgePick === null) return null;
    const normalizedAnswer = currentCard.answer.trim();
    const isTrueAnswer = /^对|正确|是|yes|true/i.test(normalizedAnswer);
    const isFalseAnswer = /^错|错误|否|no|false/i.test(normalizedAnswer);
    if (isTrueAnswer) return judgePick === true;
    if (isFalseAnswer) return judgePick === false;
    // 无法自动判分时，按用户选择显示即可
    return null;
  }, [currentCard, judgePick]);

  function handleShowAnswer() {
    setShowAnswer(true);
  }

  function handleJudgePick(pick: boolean) {
    setJudgePick(pick);
    setShowAnswer(true);
  }

  async function handleRate(result: ReviewResult) {
    if (!currentCard || submitting) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/recite/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardId: currentCard.id,
          result,
          userAnswer: currentCard.cardType === "qa" ? userAnswer : undefined,
        }),
      });
      const data = await res.json();
      if (data.code !== 0) {
        throw new Error(data.msg || "提交失败");
      }

      if (result === "forgot") {
        setForgotCount((c) => c + 1);
      }
      setCompletedCount((c) => c + 1);

      if (currentIndex < cards.length - 1) {
        setCurrentIndex((i) => i + 1);
        setShowAnswer(false);
        setUserAnswer("");
        setJudgePick(null);
      } else {
        setCurrentIndex(cards.length);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 dark:bg-black">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">加载今日卡片中...</p>
      </main>
    );
  }

  if (error && cards.length === 0) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-6 text-center dark:bg-black">
        <p className="mb-6 text-sm text-red-600 dark:text-red-400">{error}</p>
        <Link
          href="/"
          className="rounded-full bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          返回首页
        </Link>
      </main>
    );
  }

  if (totalCount === 0 || !currentCard) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-6 text-center dark:bg-black">
        <div className="mb-4 text-5xl">🎉</div>
        <h1 className="mb-2 text-xl font-bold text-zinc-900 dark:text-zinc-50">今日复习已完成</h1>
        <p className="mb-8 text-sm text-zinc-500 dark:text-zinc-400">{getEncouragement(0, 0)}</p>
        <Link
          href="/recite/materials"
          className="rounded-full bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          查看材料
        </Link>
      </main>
    );
  }

  if (currentIndex >= totalCount) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-6 text-center dark:bg-black">
        <div className="mb-4 text-5xl">🎉</div>
        <h1 className="mb-2 text-2xl font-bold text-zinc-900 dark:text-zinc-50">今日复习完成</h1>
        <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
          今日复习 {completedCount} 张，其中忘了 {forgotCount} 张
        </p>
        <p className="mb-8 text-sm font-medium text-indigo-600 dark:text-indigo-400">
          {getEncouragement(forgotCount, completedCount)}
        </p>
        <Link
          href="/"
          className="rounded-full bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          返回首页
        </Link>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col bg-zinc-50 dark:bg-black">
      {/* 顶部进度条 */}
      <div className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/90">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <Link
            href="/"
            className="rounded-lg px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            ← 返回
          </Link>
          <div className="flex-1">
            <div className="mb-1 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
              <span>今日进度</span>
              <span>{progressLabel}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div
                className="h-full rounded-full bg-indigo-600 transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 卡片区 */}
      <div className="flex flex-1 flex-col justify-center px-4 py-6 sm:px-6">
        <div className="mx-auto w-full max-w-2xl">
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-8">
            {/* 题型标签 */}
            <div className="mb-4 flex items-center gap-2">
              <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                {currentCard.cardType === "cloze" && "挖空"}
                {currentCard.cardType === "qa" && "简答"}
                {currentCard.cardType === "judge" && "判断"}
              </span>
              {currentCard.hint && (
                <span className="text-xs text-zinc-400 dark:text-zinc-500">提示：{currentCard.hint}</span>
              )}
            </div>

            {/* 题目 */}
            <div className="mb-6">{renderQuestion(currentCard.question)}</div>

            {/* 简答题默写输入 */}
            {currentCard.cardType === "qa" && !showAnswer && (
              <div className="mb-6">
                <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  默写作答（可选）
                </label>
                <textarea
                  value={userAnswer}
                  onChange={(e) => setUserAnswer(e.target.value)}
                  rows={4}
                  placeholder="先试着默写答案..."
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
                />
              </div>
            )}

            {/* 判断题对/错按钮 */}
            {currentCard.cardType === "judge" && !showAnswer && (
              <div className="mb-6 grid grid-cols-2 gap-3">
                <button
                  onClick={() => handleJudgePick(true)}
                  className="rounded-xl bg-emerald-100 py-3 text-base font-semibold text-emerald-700 transition hover:bg-emerald-200 active:bg-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 dark:hover:bg-emerald-900/60"
                >
                  对
                </button>
                <button
                  onClick={() => handleJudgePick(false)}
                  className="rounded-xl bg-rose-100 py-3 text-base font-semibold text-rose-700 transition hover:bg-rose-200 active:bg-rose-300 dark:bg-rose-900/40 dark:text-rose-300 dark:hover:bg-rose-900/60"
                >
                  错
                </button>
              </div>
            )}

            {/* 显示答案按钮 */}
            {!showAnswer && currentCard.cardType !== "judge" && (
              <button
                onClick={handleShowAnswer}
                className="w-full rounded-xl bg-indigo-600 py-3 text-base font-medium text-white transition hover:bg-indigo-700 active:bg-indigo-800"
              >
                显示答案
              </button>
            )}

            {/* 答案区 */}
            {showAnswer && (
              <div className="mb-6">
                {currentCard.cardType === "judge" && judgePick !== null && isJudgeCorrect !== null && (
                  <p
                    className={`mb-2 text-sm font-medium ${
                      isJudgeCorrect
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-rose-600 dark:text-rose-400"
                    }`}
                  >
                    {isJudgeCorrect ? "判断正确" : "判断错误"}
                  </p>
                )}
                <div className="rounded-xl bg-zinc-50 p-4 dark:bg-zinc-950">
                  <p className="mb-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">答案</p>
                  <p className="text-base leading-relaxed text-zinc-900 dark:text-zinc-50">{currentCard.answer}</p>
                </div>
                {currentCard.cardType === "qa" && userAnswer.trim() && (
                  <div className="mt-3 rounded-xl bg-amber-50 p-4 dark:bg-amber-900/20">
                    <p className="mb-1 text-xs font-medium text-amber-600 dark:text-amber-400">你的作答</p>
                    <p className="text-sm text-zinc-800 dark:text-zinc-200">{userAnswer}</p>
                  </div>
                )}
              </div>
            )}

            {/* 自评按钮 */}
            {showAnswer && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {resultButtons.map(({ result, label, colorClass, bgClass }) => (
                  <button
                    key={result}
                    onClick={() => handleRate(result)}
                    disabled={submitting}
                    className={`rounded-xl py-3 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-50 ${colorClass} ${bgClass}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
