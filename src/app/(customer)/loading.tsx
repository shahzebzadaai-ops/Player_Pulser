export default function Loading() {
  return (
    <main className="space-y-3 px-4 py-6" aria-busy="true" aria-live="polite">
      <div className="skel h-8 w-40 rounded-lg" />
      <div className="grid grid-cols-2 gap-3">
        <div className="skel h-24 rounded-2xl" />
        <div className="skel h-24 rounded-2xl" />
      </div>
      <div className="skel h-36 rounded-2xl" />
      <div className="flex gap-3">
        <div className="skel h-52 w-40 rounded-2xl" />
        <div className="skel h-52 w-40 rounded-2xl" />
      </div>
      <p className="text-sm text-muted">Loading PlayerPulser…</p>
    </main>
  );
}
