import { NextResponse } from "next/server";
import { intentContinuation } from "@/domain/auth-intent";
import { getCurrentUser } from "@/server/current-user";
import { clearIntent, currentIntent } from "@/server/intent-cookie";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  const url = new URL(request.url);
  if (!user) return NextResponse.redirect(new URL("/login", url));
  const next = intentContinuation(await currentIntent());
  if (next.clearIntent) await clearIntent();
  return NextResponse.redirect(new URL(next.path, url));
}
