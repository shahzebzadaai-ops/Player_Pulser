import { NextResponse, type NextRequest } from "next/server";
import { unsignedAdminRedirect } from "@/domain/admin-access";
import { PREVIEW_COOKIE, PRIVATE_RESPONSE_HEADERS, readPreviewCookie, shieldAccess } from "@/domain/launch-shield";
import { attachVisitCookies } from "@/server/visit-cookies";

function withSurface(request: NextRequest, surface: string) {
  const headers = new Headers(request.headers);
  headers.set("x-pp-surface", surface);
  return headers;
}

function applyPrivate(response: NextResponse) {
  for (const [key, value] of Object.entries(PRIVATE_RESPONSE_HEADERS)) response.headers.set(key, value);
  return response;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const preview = readPreviewCookie(request.cookies.get(PREVIEW_COOKIE)?.value, Date.now());
  const decision = shieldAccess({ pathname, previewValid: Boolean(preview) });
  if (decision.action === "redirect") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return applyPrivate(attachVisitCookies(request, NextResponse.redirect(url)));
  }
  if (decision.action === "not-found") {
    return applyPrivate(NextResponse.json({ error: { code: "NOT_FOUND", message: "Not found." } }, { status: 404 }));
  }
  const signedIn = Boolean(request.cookies.get("pp_session")?.value);
  const adminDestination = unsignedAdminRedirect(pathname, signedIn);
  if (adminDestination) {
    const url = request.nextUrl.clone();
    url.pathname = adminDestination;
    url.search = "";
    return applyPrivate(attachVisitCookies(request, NextResponse.redirect(url)));
  }
  const response = NextResponse.next({ request: { headers: withSurface(request, decision.surface) } });
  return applyPrivate(attachVisitCookies(request, response));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw.js|pwa-icon|manifest.webmanifest).*)"],
};
