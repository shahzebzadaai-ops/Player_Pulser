"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CUSTOMER_NAV } from "@/domain/customer-nav";
import { BittuFigure } from "./bittu-figure";
import { ShowcaseMark, StreamStatus } from "./price-stream";

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

export function AppFrame({ children, demo = false, settingsAttention = false }: { children: React.ReactNode; demo?: boolean; settingsAttention?: boolean }) {
  return (
    <div className="mx-auto min-h-dvh w-full max-w-[430px] overflow-x-hidden pb-[calc(7.5rem+env(safe-area-inset-bottom))]">
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-x-3 gap-y-1 px-4 pt-3">
        <ShowcaseMark />
        <StreamStatus />
      </div>
      {demo ? <DemoSessionBar /> : null}
      <ConnectionState />
      {children}
      <BottomNav settingsAttention={settingsAttention} />
    </div>
  );
}

function DemoSessionBar() {
  const router = useRouter();
  const [pending, setPending] = useState<null | "reset" | "exit">(null);
  const [message, setMessage] = useState<string | null>(null);

  async function reset() {
    setPending("reset");
    setMessage(null);
    const response = await fetch("/api/auth/demo/reset", { method: "POST" });
    setPending(null);
    if (!response.ok) {
      setMessage("The demo could not be reset.");
      return;
    }
    router.refresh();
  }

  async function exit() {
    setPending("exit");
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <section className="mx-4 mt-3 rounded-2xl border border-india/50 bg-[#102848] p-3" aria-label="Investor demo">
      <p className="text-xs font-semibold tracking-wide text-india">INVESTOR DEMO</p>
      <p className="mt-1 text-sm">Demo mode. All money and trades are simulated and stay on this demo account.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn-secondary text-sm" disabled={pending !== null} onClick={() => void reset()}>
          {pending === "reset" ? "Resetting" : "Reset Demo"}
        </button>
        <button type="button" className="btn-secondary text-sm" disabled={pending !== null} onClick={() => void exit()}>
          {pending === "exit" ? "Leaving" : "Exit Demo"}
        </button>
      </div>
      {message ? <p role="alert" className="mt-2 text-sm text-loss">{message}</p> : null}
    </section>
  );
}

export function ConnectionState() {
  const [offline, setOffline] = useState(false);
  const [stale, setStale] = useState(false);
  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    const onPrices = (event: Event) => setStale(Boolean((event as CustomEvent<{ stale?: boolean }>).detail?.stale));
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
    <div role="status" className="mx-4 mt-3 flex items-center gap-2 rounded-xl bg-loss/15 px-3 py-2 text-sm text-ink">
      <BittuFigure pose={offline ? "shrug" : "pause"} className="h-12 w-auto shrink-0" />
      <p>
        {offline
          ? "You are offline. Buys, sells, deposits, and withdrawals stay disabled until the connection returns."
          : "The price feed is stale. New trades are paused until fresh prices arrive."}
      </p>
    </div>
  );
}

function bonusBannerOpen() {
  return window.localStorage.getItem("pp-bonus-banner") !== "hidden";
}

function subscribeBonusBanner(onStoreChange: () => void) {
  window.addEventListener("pp-bonus-banner", onStoreChange);
  return () => window.removeEventListener("pp-bonus-banner", onStoreChange);
}

export function WelcomeBanner({ status }: { status: string }) {
  const open = useSyncExternalStore(subscribeBonusBanner, bonusBannerOpen, () => false);
  if (!open || (status !== "ACTIVE" && status !== "PENDING_REVIEW")) return null;
  const active = status === "ACTIVE";
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
        ₹200 <span className="text-lg text-ink">{active ? "Welcome Bonus Active" : "Welcome bonus under review"}</span>
      </p>
      <p className="mt-1 max-w-[15rem] text-sm text-muted">{active ? "Use your bonus to start trading Indian players now." : "This account shares a device with an existing bonus, so the new bonus is not available yet."}</p>
    </section>
  );
}

const NAV_ICONS = {
  "/home": HomeIcon,
  "/market": ChartIcon,
  "/portfolio": BagIcon,
  "/wallet": WalletIcon,
  "/settings": SettingsIcon,
} as const;

export function BottomNav({ settingsAttention = false }: { settingsAttention?: boolean }) {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line/80 bg-[#081422]/95 backdrop-blur" aria-label="Primary">
      <ul className="mx-auto grid max-w-[430px] grid-cols-5 overflow-x-hidden px-1 pb-[max(0.4rem,env(safe-area-inset-bottom))] pt-2">
        {CUSTOMER_NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = NAV_ICONS[item.href];
          return (
            <li key={item.href} className="min-w-0">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`press flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-0.5 text-[10px] whitespace-nowrap ${active ? "text-india" : "text-muted"}`}
              >
                <span className="relative">
                  <Icon />
                  {item.href === "/settings" && settingsAttention ? <span className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-india" /> : null}
                </span>
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
function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c.3.7.9 1.1 1.6 1.1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
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
