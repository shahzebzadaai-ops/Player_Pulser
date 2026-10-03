import { NextResponse } from "next/server";
import type { AuthIntent } from "@/domain/auth-intent";
import { saveIntent } from "@/server/intent-cookie";

const GATE_TYPES = ["DEPOSIT", "PORTFOLIO", "REWARDS", "WATCHLIST", "REFERRAL", "HOME", "WALLET", "NOTIFICATIONS"] as const;

export async function GET(request: Request) {
  const type = new URL(request.url).searchParams.get("type");
  if (type && (GATE_TYPES as readonly string[]).includes(type)) {
    await saveIntent({ type: type as Exclude<AuthIntent["type"], "BUY"> });
  }
  return NextResponse.redirect(new URL("/login", request.url));
}
