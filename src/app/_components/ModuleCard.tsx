import Link from "next/link";

interface ModuleCardProps {
  href: string;
  title: string;
  description: string;
  emoji: string;
  colorClass: string;
}

export function ModuleCard({
  href,
  title,
  description,
  emoji,
  colorClass,
}: ModuleCardProps) {
  return (
    <Link
      href={href}
      className="group block rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-md active:scale-[0.98] dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div
        className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl text-2xl ${colorClass}`}
      >
        {emoji}
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
