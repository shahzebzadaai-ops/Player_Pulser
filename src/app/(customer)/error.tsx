"use client";

export default function CustomerError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="px-4 py-10">
      <h1 className="text-2xl font-bold">This screen did not load</h1>
      <p className="mt-2 text-sm text-muted">Nothing on this page changed your cash, bonus, or holdings.</p>
      <button type="button" className="mt-4 min-h-11 rounded-full bg-india px-5 font-semibold" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
