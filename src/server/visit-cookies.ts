import { NextResponse, type NextRequest } from "next/server";
import { isTrackablePath, isVisitorId } from "@/domain/attribution";

export const VISITOR_COOKIE = "pp_vid";
export const VISIT_COOKIE = "pp_vst";
const IDLE_MS = 30 * 60 * 1000;

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

export function attachVisitCookies(request: NextRequest, response: NextResponse): NextResponse {
  if (!isTrackablePath(request.nextUrl.pathname)) return response;
  const now = Date.now();
  const currentVisitor = request.cookies.get(VISITOR_COOKIE)?.value;
  if (!isVisitorId(currentVisitor)) {
    response.cookies.set(VISITOR_COOKIE, crypto.randomUUID(), cookieOptions(60 * 60 * 24 * 400));
  }
  const visit = request.cookies.get(VISIT_COOKIE)?.value;
  const [sessionId, seen] = visit?.split(".") ?? [];
  const seenAt = Number(seen);
  const fresh = !isVisitorId(sessionId) || !Number.isFinite(seenAt) || now - seenAt > IDLE_MS;
  response.cookies.set(VISIT_COOKIE, `${fresh ? crypto.randomUUID() : sessionId}.${now}`, cookieOptions(60 * 30));
  return response;
}
