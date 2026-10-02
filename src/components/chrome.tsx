"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { formatPaise, formatPercent, formatSignedPaise } from "@/domain/money";
import { sseRetryDelayMs } from "@/domain/realtime";

type PricePayload = {
  stale: boolean;
  players: {
    id: string;
    midPaise: string;
    buyPaise: string;
    sellPaise: string;
    changePaise: string;
    changePercent: number;
    live?: boolean;
    lastEvent?: string | null;
    whyLine?: string | null;
    pulseState?: "CALM" | "STEADY" | "ACTIVE" | "SURGE" | null;
    pulseActivity?: string | null;
    pulseFeedLabel?: string | null;
    pulsePreviewPaise?: string | null;
    pulseCycleId?: string | null;
  }[];
};

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="flex h-11 items-center rounded-full bg-card px-3 text-sm"
      onClick={() => {
        void fetch("/api/auth/logout", { method: "POST" }).then(() => {
          router.push("/login");
          router.refresh();
        });
      }}
    >
      Log out
    </button>
  );
}

export function AppFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto min-h-dvh w-full max-w-[430px] pb-28">
      <ConnectionState />
      <LivePriceBinder />
      {children}
      <BottomNav />
    </div>
  );
}

export function LivePriceBinder() {
  useEffect(() => {
    let source: EventSource | null = null;
    let poll = 0;
    const apply = (payload: PricePayload) => {
      for (const element of document.querySelectorAll<HTMLElement>("[data-price-for]")) {
        const player = payload.players.find((item) => item.id === element.dataset.priceFor);
        const field = element.dataset.field;
        if (!player || !field) continue;
        const up = BigInt(player.changePaise) >= 0n;
        const next =
          field === "change"
            ? `${formatSignedPaise(player.changePaise)} (${formatPercent(player.changePercent)})`
            : formatPaise(field === "buy" ? player.buyPaise : field === "sell" ? player.sellPaise : player.midPaise);
        if (element.textContent && element.textContent !== next) {
          element.classList.remove("flash-up", "flash-down", "price-flash");
          void element.offsetWidth;
          element.classList.add(up ? "flash-up" : "flash-down");
          if (up) element.classList.add("price-flash");
        }
        element.textContent = next;
        if (field === "change") {
          element.classList.toggle("text-gain", up);
          element.classList.toggle("text-loss", !up);
        }
      }
      for (const element of document.querySelectorAll<HTMLElement>("[data-live-event]")) {
        const player = payload.players.find((item) => item.id === element.dataset.liveEvent);
        if (player?.lastEvent) element.textContent = player.lastEvent;
      }
      for (const element of document.querySelectorAll<HTMLElement>("[data-live-why]")) {
        const player = payload.players.find((item) => item.id === element.dataset.liveWhy);
        if (player?.whyLine) element.textContent = player.whyLine;
      }
      for (const element of document.querySelectorAll<HTMLElement>("[data-live-dot]")) {
        const player = payload.players.find((item) => item.id === element.dataset.liveDot);
        const label = element.querySelector("[data-live-dot-label]");
        if (!player || !label || player.live === undefined) continue;
        label.textContent = player.live ? "LIVE" : "QUOTED";
      }
      window.dispatchEvent(new CustomEvent("pp-prices", { detail: payload }));
    };
    let stopped = false;
    let attempt = 0;
    let retryTimer = 0;
    const startPoll = () => {
      if (poll) return;
      poll = window.setInterval(async () => {
        try {
          const response = await fetch("/api/feed", { cache: "no-store" });
          if (response.ok) apply((await response.json()) as PricePayload);
        } catch {
          /* the next SSE snapshot replaces this */
        }
      }, 4000);
    };
    const connect = () => {
      source = new EventSource("/api/prices/stream");
      source.onopen = () => {
        attempt = 0;
        if (poll) {
          window.clearInterval(poll);
          poll = 0;
        }
      };
      source.onmessage = (event) => apply(JSON.parse(event.data) as PricePayload);
      source.onerror = () => {
        source?.close();
        source = null;
        if (stopped) return;
        startPoll();
        retryTimer = window.setTimeout(connect, sseRetryDelayMs(attempt));
        attempt += 1;
      };
    };
    connect();
    return () => {
      stopped = true;
      source?.close();
      if (poll) window.clearInterval(poll);
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, []);
  return null;
}

export function ConnectionState() {
  const [offline, setOffline] = useState(false);
  const [stale, setStale] = useState(false);
  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    const onPrices = (event: Event) => setStale(Boolean((event as CustomEvent<PricePayload>).detail?.stale));
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    window.addEventListener("pp-prices", onPrices);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
      window.removeEventListener("pp-prices", onPrices);
    };
  }, []);
  if (!offline && !stale) return null;
  return (
    <p role="status" className="mx-4 mt-3 rounded-xl bg-loss/15 px-3 py-2 text-sm text-ink">
      {offline
        ? "You are offline. Buys, sells, deposits, and withdrawals stay disabled until the connection returns."
        : "The price feed is stale. New trades are paused until fresh prices arrive."}
    </p>
  );
}

function bonusBannerOpen() {
  return window.localStorage.getItem("pp-bonus-banner") !== "hidden";
}

function subscribeBonusBanner(onStoreChange: () => void) {
  window.addEventListener("pp-bonus-banner", onStoreChange);
  return () => window.removeEventListener("pp-bonus-banner", onStoreChange);
}

export function WelcomeBanner() {
  const open = useSyncExternalStore(subscribeBonusBanner, bonusBannerOpen, () => false);
  if (!open) return null;
  return (
    <section className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#16448f] via-[#12366f] to-[#0c2348] p-4">
      <button
        type="button"
        className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-lg"
        aria-label="Dismiss welcome bonus"
        onClick={() => {
          window.localStorage.setItem("pp-bonus-banner", "hidden");
          window.dispatchEvent(new Event("pp-bonus-banner"));
        }}
      >
        ×
      </button>
      <p className="text-2xl font-bold text-gold">
        ₹200 <span className="text-lg text-ink">Welcome Bonus Active</span>
      </p>
      <p className="mt-1 max-w-[15rem] text-sm text-muted">Use your bonus to start trading Indian players now.</p>
    </section>
  );
}

const NAV = [
  { href: "/home", label: "Home", icon: HomeIcon },
  { href: "/market", label: "Markets", icon: ChartIcon },
  { href: "/portfolio", label: "Portfolio", icon: BagIcon },
  { href: "/rewards", label: "Rewards", icon: GiftIcon },
  { href: "/wallet", label: "Wallet", icon: WalletIcon },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line/80 bg-[#081422]/95 backdrop-blur" aria-label="Primary">
      <ul className="mx-auto flex max-w-[430px] justify-between px-2 pb-[max(0.4rem,env(safe-area-inset-bottom))] pt-2">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`press flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[11px] ${active ? "text-india" : "text-muted"}`}
              >
                <Icon />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5z" />
    </svg>
  );
}
function ChartIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M4 19h16M7 16v-5M12 16V8M17 16v-3" />
    </svg>
  );
}
function BagIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M6 8h12l-1 12H7L6 8zM9 8V7a3 3 0 0 1 6 0v1" />
    </svg>
  );
}
function GiftIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M4 11h16v9H4zM3 7h18v4H3zM12 7v13M12 7c-2 0-3.5-2-2.2-3.2C11 2.6 12 5 12 7zm0 0c2 0 3.5-2 2.2-3.2C13 2.6 12 5 12 7z" />
    </svg>
  );
}
function WalletIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18M16 14h2" />
    </svg>
  );
}

export function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);
  return null;
}
