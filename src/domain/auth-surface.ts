/** A closed auth sheet renders nothing, including the password fallback. */
export function visibleAuthParts(open: boolean): Array<"sheet"> {
  return open ? ["sheet"] : [];
}

/** The sheet is open only while the current URL still asks for login or signup. */
export function authSheetOpen(pathname: string, search: string): boolean {
  const mode = new URLSearchParams(search).get("auth");
  if (mode !== "login" && mode !== "signup") return false;
  return !pathname.startsWith("/admin") && !pathname.startsWith("/dev");
}

/** Stay on this page and drop only the auth-sheet query. */
export function withoutAuthMode(href: string): string {
  const url = new URL(href, "http://local");
  url.searchParams.delete("auth");
  url.searchParams.delete("profile");
  url.searchParams.delete("passkey");
  const query = url.searchParams.toString();
  return query ? `${url.pathname}?${query}` : url.pathname || "/";
}

/** Switch login/signup without leaving the page or keeping a finished substep. */
export function withAuthMode(href: string, mode: "login" | "signup"): string {
  const url = new URL(href, "http://local");
  url.searchParams.set("auth", mode);
  url.searchParams.delete("profile");
  url.searchParams.delete("passkey");
  return `${url.pathname}?${url.searchParams.toString()}`;
}

export function directLoginTarget(query: { link?: string; error?: string }, signedIn: boolean): string {
  if (signedIn) return "/continue";
  const params = new URLSearchParams({ auth: "login" });
  if (query.link === "1") params.set("link", "1");
  if (query.error === "google" || query.error === "demo") params.set("error", query.error);
  return `/?${params.toString()}`;
}

export function directSignupTarget(signedIn: boolean): string {
  return signedIn ? "/continue" : "/?auth=signup";
}
