"use client";

import { useEffect, useRef, useState } from "react";
import type { UTCTimestamp } from "lightweight-charts";
import { historyWindow, nextChartPoint } from "@/domain/live-prices";

const RANGES = ["1H", "1D", "7D", "30D", "ALL"] as const;
type Range = (typeof RANGES)[number];
type Point = { time: number; value: number };

export function PriceChart({ playerId, initial, initialNote = null }: { playerId: string; initial: Point[]; initialNote?: string | null }) {
  const host = useRef<HTMLDivElement>(null);
  const seriesRef = useRef<{ update: (bar: Point) => void } | null>(null);
  const lastTimeRef = useRef<number | null>(initial.at(-1)?.time ?? null);
  const [range, setRange] = useState<Range>("1D");
  const [points, setPoints] = useState<Point[]>(initial);
  const [note, setNote] = useState<string | null>(initialNote);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<{ price: string; when: string } | null>(null);

  useEffect(() => {
    const onPrices = (event: Event) => {
      const payload = (event as CustomEvent<{ players?: { id: string; chartTime?: number | null; chartValue?: number | null }[] }>).detail;
      const player = payload?.players?.find((item) => item.id === playerId);
      if (player?.chartTime == null || player.chartValue == null || !seriesRef.current) return;
      const point = nextChartPoint(lastTimeRef.current, { time: player.chartTime, value: player.chartValue });
      if (!point) return;
      try {
        seriesRef.current.update(point);
        lastTimeRef.current = point.time;
      } catch {
        /* an older bar cannot extend the series */
      }
    };
    window.addEventListener("pp-prices", onPrices);
    return () => window.removeEventListener("pp-prices", onPrices);
  }, [playerId]);

  useEffect(() => {
    const node = host.current;
    if (!node || points.length === 0) return;
    let chart: { remove: () => void } | null = null;
    let cancelled = false;
    lastTimeRef.current = points[points.length - 1]?.time ?? null;
    const rising = points.length < 2 || points[points.length - 1].value >= points[0].value;
    const flat = points.length > 1 && points[points.length - 1].value === points[0].value;
    void import("lightweight-charts").then(({ createChart, AreaSeries, ColorType, LineStyle }) => {
      if (cancelled || !host.current) return;
      const theme = getComputedStyle(document.documentElement);
      const gain = theme.getPropertyValue("--color-gain").trim() || "#1ed760";
      const loss = theme.getPropertyValue("--color-loss").trim() || "#ff4d5e";
      const muted = theme.getPropertyValue("--color-muted").trim() || "#b7c5d8";
      const line = flat ? muted : rising ? gain : loss;
      const instance = createChart(host.current, {
        autoSize: true,
        layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#b7c5d8", fontFamily: "inherit", attributionLogo: false },
        grid: { vertLines: { visible: false }, horzLines: { visible: false } },
        rightPriceScale: { visible: false, borderVisible: false },
        leftPriceScale: { visible: false },
        timeScale: { visible: false, borderVisible: false },
        crosshair: {
          vertLine: { color: "#3d8bff", width: 1, style: LineStyle.Solid, labelVisible: false },
          horzLine: { visible: false, labelVisible: false },
        },
        handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: false, vertTouchDrag: false },
        handleScale: { mouseWheel: false, pinch: false, axisPressedMouseMove: false },
      });
      const series = instance.addSeries(AreaSeries, {
        lineColor: line,
        topColor: flat ? "rgba(183,197,216,0.16)" : rising ? "rgba(30,215,96,0.28)" : "rgba(255,77,94,0.28)",
        bottomColor: "rgba(7,17,31,0)",
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerRadius: 4,
      });
      series.setData(points.map((point) => ({ time: point.time as UTCTimestamp, value: point.value })));
      seriesRef.current = { update: (bar) => series.update({ time: bar.time as UTCTimestamp, value: bar.value }) };
      instance.timeScale().fitContent();
      instance.subscribeCrosshairMove((param) => {
        const row = param.seriesData.get(series) as { value?: number } | undefined;
        if (!param.time || row?.value === undefined) {
          setHover(null);
          return;
        }
        const stamp = typeof param.time === "number" ? param.time * 1000 : Date.parse(String(param.time));
        const when = Number.isFinite(stamp)
          ? new Date(stamp).toLocaleString("en-IN", { hour: "numeric", minute: "2-digit", month: "short", day: "numeric", timeZone: "Asia/Kolkata" })
          : "";
        setHover({ price: `₹${row.value.toFixed(2)}`, when });
      });
      chart = instance;
    });
    return () => {
      cancelled = true;
      seriesRef.current = null;
      chart?.remove();
      setHover(null);
    };
  }, [points]);

  async function choose(next: Range) {
    if (next === range) return;
    setRange(next);
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/charts/${playerId}?range=${historyWindow(next)}`, { cache: "no-store" });
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
    <section>
      <div className="relative h-56">
        {hover ? (
          <p className="absolute left-0 top-0 z-10 text-sm">
            <span className="num font-semibold">{hover.price}</span>
            <span className="ml-2 text-muted">{hover.when}</span>
          </p>
        ) : null}
        {loading ? <div className="skel h-56" aria-hidden /> : null}
        {error ? <p className="py-8 text-center text-sm text-loss">{error}</p> : null}
        {!error && points.length === 0 ? <p className="py-8 text-center text-sm text-muted">No prices in this range yet.</p> : null}
        <div ref={host} className={loading || error || points.length === 0 ? "hidden" : "h-56"} />
      </div>
      <div className="mt-2 flex gap-1" role="tablist" aria-label="Price history range">
        {RANGES.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={range === item}
            className={`min-h-11 flex-1 text-sm ${range === item ? "border-b-2 border-india font-semibold text-india" : "text-muted"}`}
            onClick={() => void choose(item)}
          >
            {item}
          </button>
        ))}
      </div>
      {note ? <p className="mt-1 text-xs text-muted">{note}</p> : null}
    </section>
  );
}
