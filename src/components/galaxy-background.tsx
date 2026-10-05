"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const MOBILE_STARS = { far: 42, mid: 20, near: 10 };
const DESKTOP_STARS = { far: 72, mid: 36, near: 18 };

export function GalaxyBackground() {
  const pathname = usePathname();
  const admin = pathname.startsWith("/admin");
  const farRef = useRef<HTMLDivElement>(null);
  const midRef = useRef<HTMLDivElement>(null);
  const nearRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (admin) return;
    let cancel = false;
    const paint = () => {
      if (cancel) return;
      const field = buildField(window.innerWidth, window.innerHeight);
      if (farRef.current) farRef.current.style.boxShadow = field.far;
      if (midRef.current) midRef.current.style.boxShadow = field.mid;
      if (nearRef.current) nearRef.current.style.boxShadow = field.near;
      document.documentElement.classList.add("galaxy-on");
    };
    const stopIdle = onIdle(paint);
    const root = document.documentElement;
    const sync = () => root.classList.toggle("galaxy-paused", document.hidden);
    sync();
    document.addEventListener("visibilitychange", sync);

    let resizeTimer = 0;
    let lastWidth = window.innerWidth;
    const onResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        const next = window.innerWidth;
        const crossed = (lastWidth <= 640) !== (next <= 640);
        const jumped = Math.abs(next - lastWidth) > 80;
        if (!cancel && (crossed || jumped)) {
          lastWidth = next;
          paint();
        }
      }, 280);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancel = true;
      stopIdle();
      window.clearTimeout(resizeTimer);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", sync);
      root.classList.remove("galaxy-paused", "galaxy-on");
    };
  }, [admin]);

  if (admin) return null;

  return (
    <div className="galaxy" aria-hidden="true">
      <div className="galaxy-nebula" />
      <div ref={farRef} className="galaxy-layer galaxy-far" />
      <div ref={midRef} className="galaxy-layer galaxy-mid" />
      <div ref={nearRef} className="galaxy-layer galaxy-near" />
    </div>
  );
}

function onIdle(run: () => void) {
  const win = window as Window & {
    requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (typeof win.requestIdleCallback === "function") {
    const id = win.requestIdleCallback(run, { timeout: 1200 });
    return () => win.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(run, 48);
  return () => window.clearTimeout(id);
}

function buildField(width: number, height: number) {
  const counts = width <= 640 ? MOBILE_STARS : DESKTOP_STARS;
  const radius = Math.hypot(width, height) * 0.62;
  const rand = mulberry32(0x51a7c3);
  return {
    far: shadows(rand, counts.far, radius, 0.16, 0.34, 0),
    mid: shadows(rand, counts.mid, radius * 0.92, 0.28, 0.45, 0.35),
    near: shadows(rand, counts.near, radius * 0.8, 0.5, 0.68, 0.65),
  };
}

function shadows(
  rand: () => number,
  count: number,
  radius: number,
  minAlpha: number,
  maxAlpha: number,
  spread: number,
) {
  const parts: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const angle = rand() * Math.PI * 2;
    const distance = Math.sqrt(rand()) * radius;
    const x = Math.round(Math.cos(angle) * distance);
    const y = Math.round(Math.sin(angle) * distance);
    const alpha = (minAlpha + rand() * (maxAlpha - minAlpha)).toFixed(2);
    const color = rand() > 0.78 ? `rgba(158, 196, 255, ${alpha})` : `rgba(236, 243, 255, ${alpha})`;
    parts.push(`${x}px ${y}px 0 ${spread}px ${color}`);
  }
  return parts.join(",");
}

function mulberry32(seed: number) {
  let state = seed;
  return function next() {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
