"use client";

import { useEffect, useState } from "react";
import { BittuFigure } from "./bittu-figure";

type NewsCard = {
  id: string;
  title: string;
  summary: string;
  sourceName: string;
  url: string;
  publishedLabel: string;
  unread: boolean;
};

type Desk = {
  enabled: boolean;
  alert: "offline" | "idle" | "new" | "important" | "high";
  unread: number;
  lastSuccessAt: string | null;
  today: NewsCard[];
  earlier: NewsCard[];
};

export function NewsPulseButton() {
  return <NewsPulse mode="button" />;
}

export function PlayerNewsDesk({ playerId }: { playerId: string }) {
  return <NewsPulse mode="embed" playerId={playerId} />;
}

function NewsPulse({ mode, playerId }: { mode: "button" | "embed"; playerId?: string }) {
  const [desk, setDesk] = useState<Desk | null>(null);
  const [open, setOpen] = useState(mode === "embed");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancel = false;
    const load = () => {
      const query = playerId ? `?playerId=${encodeURIComponent(playerId)}` : "";
      void fetch(`/api/news-pulse${query}`)
        .then((response) => {
          if (!response.ok) throw new Error("desk");
          return response.json() as Promise<Desk>;
        })
        .then((body) => {
          if (!cancel) {
            setDesk(body);
            setFailed(false);
          }
        })
        .catch(() => {
          if (!cancel) setFailed(true);
        });
    };
    load();
    const timer = window.setInterval(load, 60_000);
    return () => {
      cancel = true;
      window.clearInterval(timer);
    };
  }, [playerId]);

  if (desk && !desk.enabled) return null;
  const alert = failed ? "offline" : desk?.alert ?? "idle";
  const talking = alert === "new" || alert === "important" || alert === "high";

  function openDesk() {
    setOpen(true);
    const ids = [...(desk?.today ?? []), ...(desk?.earlier ?? [])].filter((article) => article.unread).map((article) => article.id);
    if (!ids.length) return;
    void fetch("/api/news-pulse/seen", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids }),
    }).then(() => {
      setDesk((current) => current ? { ...current, unread: 0, alert: current.alert === "offline" ? "offline" : "idle", today: current.today.map((article) => ({ ...article, unread: false })), earlier: current.earlier.map((article) => ({ ...article, unread: false })) } : current);
    }).catch(() => undefined);
  }

  const today = desk?.today ?? [];
  const earlier = desk?.earlier ?? [];
  const feed = (
    <div className="news-desk space-y-3">
      <div className="flex items-center gap-3">
        <BittuFigure pose="present" className="h-16 w-auto shrink-0" />
        <div className="min-w-0">
          <h2 className="text-xl font-bold leading-tight">Bittu News</h2>
          <p className="mt-1 text-sm text-muted">Aaj cricket mein kya hua?</p>
        </div>
      </div>
      {alert === "offline" ? <p className="text-sm text-muted">The desk is quiet. Last successful update {formatStamp(desk?.lastSuccessAt)}.</p> : null}
      {today.length === 0 ? <p className="rounded-2xl bg-card p-4 text-sm text-muted">No new updates yet. Bittu is keeping an eye on the news.</p> : null}
      {today.map((article) => <NewsArticleCard key={article.id} article={article} />)}
      {earlier.length > 0 ? <h3 className="pt-2 text-sm font-semibold text-muted">Earlier</h3> : null}
      {earlier.map((article) => <NewsArticleCard key={article.id} article={article} />)}
    </div>
  );

  if (mode === "embed") return <section className="mt-4" aria-label="Bittu News">{feed}</section>;

  return (
    <>
      <button type="button" className="news-pulse-btn" data-alert={alert} onClick={openDesk}>
        <span className="news-pulse-portrait">
          <span className="news-pulse-ring" aria-hidden="true" />
          <span className="news-pulse-flame" aria-hidden="true" />
          <BittuFigure pose="present" className="news-pulse-bittu" />
          <span className={`news-pulse-mic ${talking ? "is-up" : ""}`} aria-hidden="true">
            <MicIcon />
          </span>
        </span>
        <span className="min-w-0 text-left">
          <span className="flex items-center gap-2">
            <span className="font-semibold">Bittu News</span>
            {alert !== "offline" && desk?.lastSuccessAt ? <span className="news-pulse-badge">LIVE</span> : null}
            {(desk?.unread ?? 0) > 0 ? <span className="news-pulse-badge is-new">NEW {desk?.unread}</span> : null}
          </span>
          <span className="mt-0.5 block text-xs text-muted">Aaj cricket mein kya hua?</span>
          {talking ? <span className="news-pulse-ticker">Bittu has a market update</span> : null}
          {alert === "offline" ? <span className="mt-0.5 block text-xs text-muted">Last update {formatStamp(desk?.lastSuccessAt)}</span> : null}
        </span>
      </button>
      {open ? (
        <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Bittu News">
          <button type="button" className="absolute inset-0 bg-black/60" aria-label="Close news desk" onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[min(88dvh,calc(100dvh-env(safe-area-inset-top)))] w-full max-w-[430px] flex-col overflow-hidden rounded-t-3xl border border-line bg-pitch pb-[env(safe-area-inset-bottom)]">
            <div className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-line" />
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-3">{feed}</div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function NewsArticleCard({ article }: { article: NewsCard }) {
  const summary = /[<>]|https?:\/\//i.test(article.summary) ? "" : article.summary;
  if (!summary) return null;
  return (
    <article className="news-card rounded-2xl border border-line bg-card p-3">
      <h3 className="text-sm font-semibold leading-snug">{article.title}</h3>
      <p className="mt-1.5 text-sm leading-snug text-muted">{summary}</p>
      <p className="mt-2 text-[11px] text-muted">
        {article.url ? (
          <a className="underline decoration-white/20 underline-offset-2" href={article.url} target="_blank" rel="noopener noreferrer">{article.sourceName}</a>
        ) : (
          <span>{article.sourceName}</span>
        )}
        {" · "}
        {article.publishedLabel}
      </p>
    </article>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 32 32" className="h-5 w-5" aria-hidden>
      <rect x="11" y="4" width="10" height="16" rx="5" fill="#f5f8fc" />
      <path d="M8 15a8 8 0 0 0 16 0" fill="none" stroke="#2f7bff" strokeWidth="2" />
      <path d="M16 23v4M12 27h8" stroke="#f5f8fc" strokeWidth="2" strokeLinecap="round" />
      <circle cx="23" cy="8" r="4" fill="#2f7bff" />
      <path d="M21.2 8h3.6M23 6.2v3.6" stroke="white" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function formatStamp(value: string | null | undefined) {
  if (!value) return "not recorded yet";
  return new Date(value).toLocaleString("en-IN", { hour: "numeric", minute: "2-digit", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}
