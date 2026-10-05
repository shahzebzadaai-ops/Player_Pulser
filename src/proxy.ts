import { NextResponse, type NextRequest } from "next/server";
import { unsignedAdminRedirect } from "@/domain/admin-access";
import { attachVisitCookies } from "@/server/visit-cookies";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const signedIn = Boolean(request.cookies.get("pp_session")?.value);
  const destination = unsignedAdminRedirect(pathname, signedIn);
  if (destination) {
    const url = request.nextUrl.clone();
    url.pathname = destination;
    url.search = "";
    return attachVisitCookies(request, NextResponse.redirect(url));
  }
  return attachVisitCookies(request, NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw.js|pwa-icon|manifest.webmanifest).*)"],
};
