export default function Loading() {
  return (
    <main className="min-h-svh bg-zinc-50 px-4 py-6 dark:bg-black sm:px-6">
      <div className="mx-auto max-w-2xl animate-pulse">
        <div className="mb-6 h-4 w-24 rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="mb-2 h-7 w-32 rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="mb-6 h-4 w-56 rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex items-start gap-3">
                <div className="h-7 w-7 shrink-0 rounded-full bg-zinc-200 dark:bg-zinc-800" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-3/4 rounded bg-zinc-200 dark:bg-zinc-800" />
                  <div className="h-3 w-1/2 rounded bg-zinc-200 dark:bg-zinc-800" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
