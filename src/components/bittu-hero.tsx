"use client";

import Link from "next/link";
import { BittuFigure } from "./bittu-figure";

export function BittuHero({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="relative mt-6 overflow-hidden rounded-3xl bg-gradient-to-br from-[#0b3f86] via-[#12386f] to-[#07111f] p-4">
      <div className="grid grid-cols-[minmax(0,1fr)_7.5rem] items-end gap-2">
        <div className="min-w-0 pb-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-india">Trade the Pulse of Cricket</p>
          <h2 className="mt-1 text-2xl font-bold leading-tight">Hi, I&apos;m Bittu!</h2>
          <p className="mt-1 text-sm">Register karo aur pao</p>
          <p className="mt-2 text-3xl font-bold leading-none">
            ₹200 <span className="text-gold">BONUS</span>
          </p>
          <p className="mt-2 text-sm text-muted">Sign up and get ₹200 welcome bonus.</p>
        </div>
        <BittuFigure pose="present" priority className="h-40 max-h-40 w-auto max-w-full justify-self-end" />
      </div>
      <button
        type="button"
        className="mt-3 min-h-11 text-left text-sm underline decoration-india underline-offset-4"
        onClick={() => window.dispatchEvent(new Event("pp-ask-bittu"))}
      >
        Help chahiye? Main hoon na!
      </button>
      {signedIn ? (
        <Link href="/home" className="btn-primary mt-3 w-full">
          Your home
        </Link>
      ) : (
        <Link href="/?auth=signup" className="btn-primary mt-3 w-full">
          Sign up
        </Link>
      )}
    </section>
  );
}
