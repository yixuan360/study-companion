import Link from "next/link";

interface ModuleCardProps {
  href: string;
  title: string;
  description: string;
  emoji: string;
  colorClass: string;
  badgeCount?: number;
  /** 自定义角标文案（如「剩 98 天 · 今日 2/5」）；不传时按 badgeCount 显示「N 待复习」 */
  badgeText?: string;
}

export function ModuleCard({
  href,
  title,
  description,
  emoji,
  colorClass,
  badgeCount,
  badgeText,
}: ModuleCardProps) {
  const showBadge = typeof badgeText === "string" || typeof badgeCount === "number";
  return (
    <Link
      href={href}
      className="group block rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-md active:scale-[0.98] dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="mb-4 flex items-start justify-between">
        <div
          className={`inline-flex h-12 w-12 items-center justify-center rounded-xl text-2xl ${colorClass}`}
        >
          {emoji}
        </div>
        {showBadge && (
          <span className="rounded-full bg-rose-500 px-2.5 py-0.5 text-xs font-semibold text-white">
            {badgeText ?? `${badgeCount} 待复习`}
          </span>
        )}
      </div>
      <h2 className="mb-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
        {title}
      </h2>
      <p className="text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
        {description}
      </p>
    </Link>
  );
}
