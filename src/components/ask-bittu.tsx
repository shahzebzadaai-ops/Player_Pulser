"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { SUGGESTED_QUESTIONS } from "@/domain/bittu-help";
import { BittuFigure } from "./bittu-figure";

type ChatMessage = { id: number; role: "user" | "bittu"; text: string };
type ProviderState = "unknown" | "off" | "on" | "error";

export function AskBittu() {
  const pathname = usePathname() || "/";
  const [open, setOpen] = useState(false);
  const [tradeLift, setTradeLift] = useState(0);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<ProviderState>("unknown");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const nextId = useRef(1);

  useEffect(() => {
    const openPanel = () => setOpen(true);
    window.addEventListener("pp-ask-bittu", openPanel);
    return () => window.removeEventListener("pp-ask-bittu", openPanel);
  }, []);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => closeRef.current?.focus());
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      window.requestAnimationFrame(() => launcherRef.current?.focus());
    };
    document.addEventListener("keydown", onKey);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [messages, pending, error]);

  useEffect(() => {
    if (!pathname.startsWith("/players/")) {
      setTradeLift(0);
      return;
    }
    const measure = () => {
      const bar = document.querySelector("[data-trade-bar]");
      if (!bar) {
        setTradeLift(0);
        return;
      }
      const rect = bar.getBoundingClientRect();
      const restingTop = window.innerHeight - 5.1 * 16 - 56;
      const overlaps = rect.top < window.innerHeight - 12 && rect.bottom > restingTop;
      setTradeLift(overlaps ? Math.ceil(window.innerHeight - rect.top + 12) : 0);
    };
    measure();
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [pathname]);

  if (pathname.startsWith("/admin") || pathname.startsWith("/dev")) return null;

  const withNav = ["/home", "/market", "/notifications", "/players", "/portfolio", "/rewards", "/settings", "/wallet"].some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  const bottom = tradeLift
    ? `calc(${tradeLift}px + env(safe-area-inset-bottom))`
    : withNav
      ? "calc(5.1rem + env(safe-area-inset-bottom))"
      : "calc(1rem + env(safe-area-inset-bottom))";
  const edge = "max(0.75rem, calc((100vw - 430px) / 2 + 0.75rem))";

  function close() {
    setOpen(false);
    window.requestAnimationFrame(() => launcherRef.current?.focus());
  }

  function onPanelKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab" || !panelRef.current) return;
    const items = [...panelRef.current.querySelectorAll<HTMLElement>("button, a, textarea")].filter((item) => !item.hasAttribute("disabled"));
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function ask(question: string) {
    const text = question.trim();
    if (!text || pending) return;
    setMessages((current) => [...current, { id: nextId.current++, role: "user", text }]);
    setDraft("");
    setError(null);
    setPending(true);
    try {
      const response = await fetch("/api/help/bittu", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const body = (await response.json()) as {
        text?: string;
        provider?: ProviderState;
        error?: { message?: string };
      };
      if (!response.ok || !body.text) {
        setError(body.error?.message ?? "Bittu could not answer just now. Try again, or open Help.");
        return;
      }
      setProvider(body.provider === "on" || body.provider === "off" || body.provider === "error" ? body.provider : "off");
      setMessages((current) => [...current, { id: nextId.current++, role: "bittu", text: body.text! }]);
    } catch {
      setError("The connection failed before Bittu replied. Your account was not changed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      {open ? (
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="fixed z-50 flex flex-col overflow-hidden rounded-3xl border border-line bg-[#122033] shadow-2xl"
          style={{ right: edge, left: edge, bottom, maxHeight: "min(32rem, calc(100dvh - 8rem - env(safe-area-inset-bottom)))" }}
          onKeyDown={onPanelKeyDown}
        >
          <header className="flex items-start gap-3 border-b border-line p-3">
            <BittuFigure pose="avatar" className="h-12 w-12 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="font-semibold">Ask Bittu</h2>
              <p className="text-xs text-muted">Automated assistant. I explain PlayerPulser. I can&apos;t trade, move money, or change settings.</p>
            </div>
            <button ref={closeRef} type="button" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-card" aria-label="Close Ask Bittu" onClick={close}>
              ×
            </button>
          </header>
          <div ref={threadRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
            <p className="text-xs text-muted">
              {provider === "on"
                ? "This conversation uses the connected assistant and the PlayerPulser help facts."
                : provider === "error"
                  ? "The assistant service did not respond. Answers below are from the help topics."
                  : "Answers come from PlayerPulser help topics. An open AI model is not connected."}
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTED_QUESTIONS.map((question) => (
                <button key={question} type="button" className="rounded-full bg-card px-3 py-2 text-left text-xs" onClick={() => void ask(question)}>
                  {question}
                </button>
              ))}
            </div>
            {messages.map((message) => (
              <div key={message.id} className={message.role === "user" ? "ml-8 rounded-2xl bg-india/20 px-3 py-2 text-sm" : "mr-6 flex items-start gap-2 text-sm"}>
                {message.role === "bittu" ? <BittuFigure pose="explain" className="h-10 w-auto shrink-0" /> : null}
                <p className="whitespace-pre-wrap">{message.text}</p>
              </div>
            ))}
            {pending ? (
              <div className="flex items-center gap-2 text-sm text-muted" role="status">
                <BittuFigure pose="thoughtful" className="h-10 w-auto shrink-0" />
                <p>Bittu is checking that.</p>
              </div>
            ) : null}
            {error ? (
              <div className="flex items-start gap-2 text-sm" role="alert">
                <BittuFigure pose="shrug" className="h-10 w-auto shrink-0" />
                <p>{error}</p>
              </div>
            ) : null}
          </div>
          <form
            className="border-t border-line p-3"
            onSubmit={(event) => {
              event.preventDefault();
              void ask(draft);
            }}
          >
            <label className="block text-xs text-muted" htmlFor="ask-bittu-question">
              Your question
            </label>
            <div className="mt-1 flex gap-2">
              <textarea
                id="ask-bittu-question"
                value={draft}
                maxLength={400}
                rows={2}
                className="min-h-11 flex-1 resize-none rounded-2xl border border-line bg-card px-3 py-2 text-sm"
                placeholder="Ask about trading, bonuses, or your account"
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void ask(draft);
                  }
                }}
              />
              <button type="submit" className="btn-primary h-11 shrink-0 px-3 text-sm" disabled={pending || draft.trim().length === 0}>
                Send
              </button>
            </div>
            <Link href="/help" className="mt-2 inline-flex min-h-11 items-center text-sm text-india">
              Open help and FAQ
            </Link>
          </form>
        </div>
      ) : (
        <button
          ref={launcherRef}
          type="button"
          className="fixed z-30 flex h-14 w-14 items-center justify-center rounded-full border border-line bg-[#122033] shadow-lg"
          style={{ right: edge, bottom }}
          aria-label="Ask Bittu"
          aria-expanded={false}
          onClick={() => setOpen(true)}
        >
          <BittuFigure pose="launcher" className="h-12 w-12" />
        </button>
      )}
    </>
  );
}
