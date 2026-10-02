const RANGES = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "7d", label: "7D" },
  { id: "30d", label: "30D" },
] as const;

export function RangeNav({ base, range }: { base: string; range: string }) {
  return (
    <form className="mt-4 flex flex-wrap items-end gap-2" action={base}>
      <div className="flex flex-wrap gap-2">
        {RANGES.map((item) => (
          <a key={item.id} href={`${base}?range=${item.id}`} className={`inline-flex min-h-10 items-center rounded-full px-3 text-sm ${range === item.id ? "bg-india" : "bg-card"}`}>
            {item.label}
          </a>
        ))}
      </div>
      <input type="hidden" name="range" value="custom" />
      <label className="text-xs text-muted">From<input className="mt-1 block min-h-10 rounded-xl border border-line bg-pitch px-2" type="date" name="from" required /></label>
      <label className="text-xs text-muted">To<input className="mt-1 block min-h-10 rounded-xl border border-line bg-pitch px-2" type="date" name="to" required /></label>
      <button className="min-h-10 rounded-full bg-card-2 px-3 text-sm" type="submit">Custom</button>
    </form>
  );
}
