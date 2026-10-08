import { NextResponse } from "next/server";
import {
  PREVIEW_COOKIE,
  PREVIEW_INVALID_MESSAGE,
  previewCookieOptions,
  PRIVATE_RESPONSE_HEADERS,
} from "@/domain/launch-shield";
import { SESSION_COOKIE } from "@/server/auth";
import { clientIp } from "@/server/audit";
import { enterInvestorDemo } from "@/server/investor-demo";
import { consumePreviewLink } from "@/server/preview-links";

export const dynamic = "force-dynamic";

function html(status: number, message: string) {
  const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>PlayerPulser</title></head><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#07111f;color:#f5f8fc;font-family:system-ui,sans-serif"><main style="max-width:28rem;padding:2rem;text-align:center"><p>${message}</p></main></body></html>`;
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      ...PRIVATE_RESPONSE_HEADERS,
    },
  });
}

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  if (!token || token.length < 43 || token.length > 80) return html(404, PREVIEW_INVALID_MESSAGE);
  let result: Awaited<ReturnType<typeof consumePreviewLink>>;
  try {
    result = await consumePreviewLink({
      rawToken: token,
      usedIp: clientIp(request),
      startDemo: enterInvestorDemo,
    });
  } catch {
    return html(404, PREVIEW_INVALID_MESSAGE);
  }
  if (!result.ok) return html(result.status, result.message);
  const response = NextResponse.redirect(new URL("/home", request.url), 303);
  const options = { ...previewCookieOptions(process.env.NODE_ENV), expires: result.expiresAt };
  response.cookies.set(PREVIEW_COOKIE, result.cookieValue, options);
  response.cookies.set(SESSION_COOKIE, result.sessionToken, options);
  for (const [key, value] of Object.entries(PRIVATE_RESPONSE_HEADERS)) response.headers.set(key, value);
  return response;
}
