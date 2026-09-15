"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/graph", label: "图谱", emoji: "🕸️" },
  { href: "/graph/import", label: "喂入", emoji: "📥" },
  { href: "/graph/sources", label: "来源", emoji: "📚" },
  { href: "/graph/growth", label: "成长", emoji: "📈" },
  { href: "/graph/cleanup", label: "清理", emoji: "🧹" },
];

/** 图谱模块底部 tab 导航：移动端固定底部，桌面端顶部横排 */
export function GraphTabs() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/graph" ? pathname === "/graph" : pathname.startsWith(href);

  return (
    <>
      {/* 桌面端顶部横排 */}
      <nav className="mb-6 hidden gap-2 sm:flex">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`min-h-[36px] rounded-full px-4 py-1.5 text-sm font-medium transition ${
              isActive(tab.href)
                ? "bg-violet-600 text-white"
                : "border border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"
            }`}
          >
            {tab.emoji} {tab.label}
          </Link>
        ))}
      </nav>
      {/* 移动端固定底部 */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-zinc-200 bg-white/95 backdrop-blur sm:hidden dark:border-zinc-800 dark:bg-zinc-900/95">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2.5 text-xs font-medium transition ${
              isActive(tab.href)
                ? "text-violet-600 dark:text-violet-300"
                : "text-zinc-400 dark:text-zinc-500"
            }`}
          >
            <span className="text-lg">{tab.emoji}</span>
            {tab.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
