"use client";

import { useEffect, useRef, useState } from "react";

const RANGES = ["1H", "24H", "7D", "30D", "ALL"] as const;
type Range = (typeof RANGES)[number];
type Point = { time: number; value: number };

export function PriceChart({ playerId, initial }: { playerId: string; initial: Point[] }) {
  const host = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState<Range>("24H");
  const [points, setPoints] = useState<Point[]>(initial);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onPrices = (event: Event) => {
      const payload = (event as CustomEvent<{ players?: { id: string; chartTime?: number | null; chartValue?: number | null }[] }>).detail;
      const player = payload?.players?.find((item) => item.id === playerId);
      if (!player?.chartTime || player.chartValue == null) return;
      setPoints((current) => {
        const last = current[current.length - 1];
        if (last && last.time >= player.chartTime!) return current;
        return [...current, { time: player.chartTime!, value: player.chartValue! }];
      });
    };
    window.addEventListener("pp-prices", onPrices);
    return () => window.removeEventListener("pp-prices", onPrices);
  }, [playerId]);

  useEffect(() => {
    const node = host.current;
    if (!node || points.length === 0) return;
    let chart: { remove: () => void } | null = null;
    let cancelled = false;
    void import("lightweight-charts").then(({ createChart, AreaSeries, ColorType }) => {
      if (cancelled || !host.current) return;
      const instance = createChart(host.current, {
        height: 220,
        autoSize: true,
        layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#b7c5d8", fontFamily: "inherit" },
        grid: { vertLines: { color: "rgba(44,68,100,0.35)" }, horzLines: { color: "rgba(44,68,100,0.35)" } },
        rightPriceScale: { borderColor: "#2c4464" },
        timeScale: { borderColor: "#2c4464", timeVisible: true, secondsVisible: false },
        crosshair: { vertLine: { color: "#3d8bff" }, horzLine: { color: "#3d8bff" } },
      });
      const series = instance.addSeries(AreaSeries, {
        lineColor: "#2f7bff",
        topColor: "rgba(47,123,255,0.35)",
        bottomColor: "rgba(47,123,255,0.02)",
        priceLineColor: "#3d8bff",
      });
      series.setData(points.map((point) => ({ time: point.time as never, value: point.value })));
      instance.timeScale().fitContent();
      chart = instance;
    });
    return () => {
      cancelled = true;
      chart?.remove();
    };
  }, [points]);

  async function choose(next: Range) {
    setRange(next);
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/charts/${playerId}?range=${next}`, { cache: "no-store" });
      const body = (await response.json()) as { points?: Point[]; note?: string | null; error?: { message: string } };
      if (!response.ok || !body.points) {
        setError(body.error?.message ?? "The chart did not load.");
        return;
      }
      setPoints(body.points);
      setNote(body.note ?? null);
    } catch {
      setError("The chart needs a connection. Prices on the page stay as they were.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-3xl border border-line bg-card p-3">
      <div className="mb-2 flex gap-1 overflow-x-auto" role="tablist" aria-label="Price history range">
        {RANGES.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={range === item}
            className={`press min-h-11 rounded-full px-3 text-sm ${range === item ? "bg-india text-white" : "bg-pitch text-muted"}`}
            onClick={() => void choose(item)}
          >
            {item === "ALL" ? "All" : item}
          </button>
        ))}
      </div>
      {loading ? <div className="skel h-[220px] rounded-2xl" aria-hidden /> : null}
      {error ? <p className="py-8 text-center text-sm text-loss">{error}</p> : null}
      {!error && points.length === 0 ? <p className="py-8 text-center text-sm text-muted">No simulated prices in this range yet.</p> : null}
      <div ref={host} className={loading || error || points.length === 0 ? "hidden" : "h-[220px]"} />
      {note ? <p className="mt-2 text-xs text-muted">{note}</p> : null}
    </section>
  );
}
