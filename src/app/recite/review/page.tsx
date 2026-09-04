"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BackLink } from "@/app/_components/BackLink";
import { scheduleReview } from "@/modules/recite/scheduler";
import type { Card, Material } from "@/generated/prisma/client";

type ReviewResult = "forgot" | "good";

const DAILY_LIMIT_OPTIONS = [5, 10, 20];

interface TodayResponse {
  code: number;
  data: {
    dueCards: Card[];
    newCards: Card[];
    totalCount: number;
    materials: Record<string, Material>;
  } | null;
  msg: string;
}

interface StatsResponse {
  code: number;
  data: {
    totalReviews: number;
    streakDays: number;
  } | null;
  msg: string;
}

/**
 * 把每日新卡均匀插入到期旧卡队列，保持旧卡相对顺序。
 * 每隔约 dueCount/(newCount+1) 张旧卡插入一张新卡。
 */
function interleaveDueAndNew(dueCards: Card[], newCards: Card[]): Card[] {
  if (newCards.length === 0) return [...dueCards];
  if (dueCards.length === 0) return [...newCards];

  const result: Card[] = [];
  let dueIndex = 0;
  const dueCount = dueCards.length;

  for (let i = 0; i < newCards.length; i++) {
    const target = Math.round(((i + 1) * dueCount) / (newCards.length + 1));
    while (dueIndex < target) {
      result.push(dueCards[dueIndex++]);
    }
    result.push(newCards[i]);
  }
  while (dueIndex < dueCount) {
    result.push(dueCards[dueIndex++]);
  }
  return result;
}

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

function normalizeCloze(question: string): string {
  // 把 Anki 格式 {{c1::答案}} 替换为 ____
  return question.replace(/\{\{c\d+::([^}]+)\}\}/g, "____");
}

function ClozeQuestion({ question, showAnswer }: { question: string; showAnswer: boolean }) {
  const text = normalizeCloze(question);
  const parts = text.split("____");
  const [fills, setFills] = useState<string[]>(() => Array(parts.length - 1).fill(""));

  if (parts.length === 1) {
    return <p className="text-lg font-medium leading-relaxed text-zinc-900 dark:text-zinc-50">{text}</p>;
  }

  return (
    <p className="text-lg font-medium leading-relaxed text-zinc-900 dark:text-zinc-50">
      {parts.map((part, index) => (
        <span key={index}>
          {part}
          {index < parts.length - 1 && (
            <input
              type="text"
              value={fills[index] ?? ""}
              onChange={(e) =>
                setFills((prev) => {
                  const next = [...prev];
                  next[index] = e.target.value;
                  return next;
                })
              }
              disabled={showAnswer}
              placeholder="?"
              className="mx-1 inline-block w-20 rounded border-b-2 border-indigo-300 bg-indigo-50 px-2 py-1 text-center text-base font-semibold text-indigo-700 placeholder:text-indigo-300 focus:border-indigo-500 focus:outline-none disabled:bg-transparent disabled:text-zinc-500 dark:border-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 dark:placeholder:text-indigo-700"
            />
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
  return (
    <Suspense
      fallback={
        <main className="flex min-h-svh flex-col items-center justify-center bg-zinc-50 px-4 dark:bg-black">
          <div className="flex items-center gap-3 text-zinc-500 dark:text-zinc-400">
            <Spinner className="h-5 w-5" />
            <p className="text-base">加载今日卡片中...</p>
          </div>
        </main>
      }
    >
      <ReviewPageInner />
    </Suspense>
  );
}

function ReviewPageInner() {
  const searchParams = useSearchParams();
  const materialId = searchParams.get("materialId");
  const [dailyLimit, setDailyLimit] = useState(10);
  const [cards, setCards] = useState<Card[]>([]);
  const [materials, setMaterials] = useState<Record<string, Material>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [userAnswer, setUserAnswer] = useState("");
  const [judgePick, setJudgePick] = useState<boolean | null>(null);
  const [completedCount, setCompletedCount] = useState(0);
  const [forgotCount, setForgotCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [stats, setStats] = useState<{ totalReviews: number; streakDays: number } | null>(null);

  useEffect(() => {
    const qs = new URLSearchParams();
    if (materialId) qs.set("materialId", materialId);
    qs.set("dailyNewCardLimit", String(dailyLimit));
    let cancelled = false;

    fetch(`/api/recite/today?${qs.toString()}`)
      .then((res) => res.json())
      .then((result: TodayResponse) => {
        if (cancelled) return;
        if (result.code !== 0 || !result.data) {
          throw new Error(result.msg || "加载失败");
        }
        const mixed = interleaveDueAndNew(result.data.dueCards, result.data.newCards);
        setCards(mixed);
        setMaterials(result.data.materials);
        setCurrentIndex(0);
        setCompletedCount(0);
        setForgotCount(0);
        setShowAnswer(false);
        setUserAnswer("");
        setJudgePick(null);
        setError("");
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [materialId, dailyLimit]);

  useEffect(() => {
    // 复习完成（或无卡片）后加载累计统计
    if (!loading && (currentIndex >= cards.length)) {
      fetch("/api/recite/stats")
        .then((res) => res.json())
        .then((result: StatsResponse) => {
          if (result.code === 0 && result.data) {
            setStats(result.data);
          }
        })
        .catch(() => {
          // 统计失败不影响主流程
        });
    }
  }, [loading, currentIndex, cards.length]);

  const currentCard = cards[currentIndex];
  const totalCount = cards.length;
  const progressLabel = totalCount === 0 ? "" : `${Math.min(completedCount + 1, totalCount)} / ${totalCount}`;
  const progressPercent = totalCount === 0 ? 0 : (completedCount / totalCount) * 100;
  const currentMaterial = currentCard ? materials[currentCard.materialId] : null;

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

  // 「记得」后的下次复习时间预览
  const goodPreview = useMemo(() => {
    if (!currentCard) return null;
    return scheduleReview({
      mastery: currentCard.mastery,
      intervalDays: currentCard.intervalDays,
      reviewCount: currentCard.reviewCount,
      lapseCount: currentCard.lapseCount,
      goodStreak: currentCard.goodStreak,
      result: "good",
    });
  }, [currentCard]);

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

  function renderStatsLine() {
    if (!stats) return null;
    return (
      <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
        累计复习 {stats.totalReviews} 次 · 连续复习 {stats.streakDays} 天
      </p>
    );
  }

  if (loading) {
    return (
      <main className="flex min-h-svh flex-col items-center justify-center bg-zinc-50 px-4 dark:bg-black">
        <div className="flex items-center gap-3 text-zinc-500 dark:text-zinc-400">
          <Spinner className="h-5 w-5" />
          <p className="text-base">加载今日卡片中...</p>
        </div>
      </main>
    );
  }

  if (error && cards.length === 0) {
    return (
      <main className="flex min-h-svh flex-col items-center justify-center bg-zinc-50 px-6 text-center dark:bg-black">
        <p className="mb-6 text-sm text-red-600 dark:text-red-400">{error}</p>
        <BackLink href="/recite">返回背诵模块</BackLink>
      </main>
    );
  }

  if (totalCount === 0 || !currentCard) {
    return (
      <main className="flex min-h-svh flex-col items-center justify-center bg-zinc-50 px-6 text-center dark:bg-black">
        <div className="mb-4 text-5xl">🎉</div>
        <h1 className="mb-2 text-xl font-bold text-zinc-900 dark:text-zinc-50">今日复习已完成</h1>
        <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">{getEncouragement(0, 0)}</p>
        {renderStatsLine()}
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href={materialId ? `/recite/materials/${materialId}` : "/recite/materials"}
            className="rounded-full bg-zinc-900 px-6 py-3 text-base font-medium text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            查看材料
          </Link>
          <Link
            href="/recite/import"
            className="rounded-full bg-indigo-600 px-6 py-3 text-base font-medium text-white transition hover:bg-indigo-700"
          >
            录入新材料
          </Link>
        </div>
      </main>
    );
  }

  if (currentIndex >= totalCount) {
    return (
      <main className="flex min-h-svh flex-col items-center justify-center bg-zinc-50 px-6 text-center dark:bg-black">
        <div className="mb-4 text-5xl">🎉</div>
        <h1 className="mb-2 text-2xl font-bold text-zinc-900 dark:text-zinc-50">今日复习完成</h1>
        <p className="mb-2 text-base text-zinc-600 dark:text-zinc-400">
          今日复习 {completedCount} 张，其中忘了 {forgotCount} 张
        </p>
        {renderStatsLine()}
        <p className="mb-8 text-base font-medium text-indigo-600 dark:text-indigo-400">
          {getEncouragement(forgotCount, completedCount)}
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <BackLink href="/recite">返回背诵模块</BackLink>
          <Link
            href={materialId ? `/recite/materials/${materialId}` : "/recite/materials"}
            className="rounded-full bg-indigo-600 px-6 py-3 text-base font-medium text-white transition hover:bg-indigo-700"
          >
            查看材料
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-svh flex-col bg-zinc-50 dark:bg-black">
      {/* 顶部进度条 */}
      <div className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/90">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <BackLink href="/recite">返回</BackLink>
          <div className="flex-1">
            <div className="mb-1 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
              <span>
                今日进度
                {materialId && currentMaterial ? ` · ${currentMaterial.title}` : ""}
              </span>
              <span className="flex items-center gap-2">
                <label className="sr-only" htmlFor="daily-limit">
                  每日新卡上限
                </label>
                <select
                  id="daily-limit"
                  value={dailyLimit}
                  onChange={(e) => setDailyLimit(Number(e.target.value))}
                  className="rounded border border-zinc-200 bg-white px-1.5 py-0.5 text-xs text-zinc-600 focus:border-indigo-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                >
                  {DAILY_LIMIT_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      新卡 {n}
                    </option>
                  ))}
                </select>
                <span>{progressLabel}</span>
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
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
        <div className="mx-auto w-full max-w-2xl space-y-4">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-8">
            {/* 题型标签 */}
            <div className="mb-4 flex items-center gap-2">
              <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                {currentCard.cardType === "cloze" && "挖空"}
                {currentCard.cardType === "qa" && "简答"}
                {currentCard.cardType === "judge" && "判断"}
              </span>
              {currentCard.mastery === "new" && (
                <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-medium text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                  新卡
                </span>
              )}
              {currentCard.hint && (
                <span className="text-xs text-zinc-400 dark:text-zinc-500">提示：{currentCard.hint}</span>
              )}
            </div>

            {/* 题目 */}
            <div className="mb-6">
              {currentCard.cardType === "cloze" ? (
                <ClozeQuestion key={currentCard.id} question={currentCard.question} showAnswer={showAnswer} />
              ) : (
                <p className="text-lg font-medium leading-relaxed text-zinc-900 dark:text-zinc-50">
                  {normalizeCloze(currentCard.question)}
                </p>
              )}
            </div>

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
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-base text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
                />
              </div>
            )}

            {/* 判断题对/错按钮 */}
            {currentCard.cardType === "judge" && !showAnswer && (
              <div className="mb-6 grid grid-cols-2 gap-3">
                <button
                  onClick={() => handleJudgePick(true)}
                  className="rounded-xl bg-emerald-100 py-4 text-lg font-semibold text-emerald-700 transition hover:bg-emerald-200 active:bg-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 dark:hover:bg-emerald-900/60"
                >
                  对
                </button>
                <button
                  onClick={() => handleJudgePick(false)}
                  className="rounded-xl bg-rose-100 py-4 text-lg font-semibold text-rose-700 transition hover:bg-rose-200 active:bg-rose-300 dark:bg-rose-900/40 dark:text-rose-300 dark:hover:bg-rose-900/60"
                >
                  错
                </button>
              </div>
            )}

            {/* 显示答案按钮 */}
            {!showAnswer && currentCard.cardType !== "judge" && (
              <button
                onClick={handleShowAnswer}
                className="w-full rounded-xl bg-indigo-600 py-4 text-base font-medium text-white transition hover:bg-indigo-700 active:bg-indigo-800"
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

            {/* 自评按钮（两档） */}
            {showAnswer && (
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => handleRate("forgot")}
                  disabled={submitting}
                  className="rounded-xl bg-rose-100 py-4 text-base font-semibold text-rose-700 transition hover:bg-rose-200 active:bg-rose-300 disabled:opacity-50 dark:bg-rose-900/40 dark:text-rose-300 dark:hover:bg-rose-900/60"
                >
                  <span className="block">忘了</span>
                  <span className="mt-0.5 block text-xs font-normal opacity-80">明天再见</span>
                </button>
                <button
                  onClick={() => handleRate("good")}
                  disabled={submitting}
                  className="rounded-xl bg-emerald-100 py-4 text-base font-semibold text-emerald-700 transition hover:bg-emerald-200 active:bg-emerald-300 disabled:opacity-50 dark:bg-emerald-900/40 dark:text-emerald-300 dark:hover:bg-emerald-900/60"
                >
                  <span className="block">记得</span>
                  <span className="mt-0.5 block text-xs font-normal opacity-80">
                    {goodPreview ? `${goodPreview.intervalDays} 天后再见` : ""}
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* 背诵原文 */}
          {currentMaterial && (
            <details className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
              <summary className="cursor-pointer select-none p-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800 sm:p-5">
                查看背诵原文
              </summary>
              <div className="border-t border-zinc-100 p-4 text-sm leading-relaxed text-zinc-600 dark:border-zinc-800 dark:text-zinc-400 sm:p-5">
                <p className="mb-2 text-xs font-medium text-zinc-400 dark:text-zinc-500">
                  来源：{currentMaterial.title}
                </p>
                <div className="max-h-60 overflow-auto whitespace-pre-wrap">{currentMaterial.rawContent}</div>
              </div>
            </details>
          )}
        </div>
      </div>
    </main>
  );
}
