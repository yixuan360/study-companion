"use client";

import Link from "next/link";

interface BackLinkProps {
  href: string;
  children: React.ReactNode;
}

export function BackLink({ href, children }: BackLinkProps) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 active:scale-[0.98] dark:text-zinc-400 dark:hover:bg-zinc-800"
    >
      <span aria-hidden>←</span>
      {children}
    </Link>
  );
}
