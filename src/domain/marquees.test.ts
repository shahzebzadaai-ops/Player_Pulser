import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/app/globals.css", "utf8");
const pulse = readFileSync("src/components/price-display.tsx", "utf8");
const ticker = readFileSync("src/components/player-ticker.tsx", "utf8");

function block(source: string, start: string, end: string) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  return source.slice(from, to);
}

describe("market marquees", () => {
  it("keeps one scrolling track on phones instead of a static wrap", () => {
    expect(css).not.toMatch(/max-width:\s*767px/);
    expect(css).not.toMatch(/pointer:\s*coarse/);
    expect(css).not.toMatch(/\.market-marquee[\s\S]{0,120}animation-play-state:\s*paused/);
    expect(css).not.toMatch(/\.player-marquee[\s\S]{0,120}animation-play-state:\s*paused/);
    expect(css).not.toMatch(/\.market-marquee\s*\{[^}]*width:\s*100%/);
    const motion = block(css, "@media (prefers-reduced-motion: reduce)", "@media");
    expect(motion).toContain(".market-marquee");
    expect(motion).toContain(".player-marquee");
    expect(motion).toContain("animation: none");
  });

  it("moves a duplicated max-content track with translate3d", () => {
    expect(css).toContain("to { transform: translate3d(-50%, 0, 0); }");
    expect(css).toContain("width: max-content");
    expect(css).toContain("flex-wrap: nowrap");
    expect(css).toMatch(/\.market-marquee[\s\S]*animation:\s*ticker 52s linear infinite/);
    expect(css).toMatch(/\.player-marquee\s*\{[^}]*animation-duration:\s*70s/);
  });

  it("duplicates both strips and keys rows by symbol or player id", () => {
    expect(pulse).toContain('key={quote.symbol}');
    expect(pulse).toContain("key={`${quote.symbol}-copy`}");
    expect(pulse).toContain('className="ticker-group gap-8 pr-8"');
    expect(pulse.match(/ticker-group gap-8 pr-8/g)).toHaveLength(2);
    expect(pulse).not.toContain("animationPlayState");
    expect(pulse).not.toContain("onPointerDown");
    expect(ticker).toContain("key={`${player.id}-${copy}`}");
    expect(ticker.match(/ticker-group gap-16 pr-16/g)).toHaveLength(2);
    expect(ticker).not.toContain("animationPlayState");
    expect(ticker).not.toContain("onPointerDown");
    expect(ticker).not.toMatch(/key=\{[^}]*(?:price|changePercent|updatedAt)/);
    expect(pulse).not.toMatch(/key=\{[^}]*(?:price|changePercent|updatedAt)/);
  });
});
