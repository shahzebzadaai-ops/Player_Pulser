import { NextResponse, type NextRequest } from "next/server";
import { attachVisitCookies } from "@/server/visit-cookies";

const PROTECTED = ["/admin"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const needsAuth = PROTECTED.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  const signedIn = Boolean(request.cookies.get("pp_session")?.value);
  if (needsAuth && !signedIn) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return attachVisitCookies(request, NextResponse.redirect(url));
  }
  return attachVisitCookies(request, NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw.js|pwa-icon|manifest.webmanifest).*)"],
};
