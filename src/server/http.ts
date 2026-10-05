import { cookies } from "next/headers";
import type { User } from "@prisma/client";
import { z } from "zod";
import { AppError } from "@/domain/errors";
import { isInvestorDemoIdentity } from "@/domain/investor-demo";
import { assertAdmin, destroySession, issueSession, SESSION_COOKIE, tokenFromCookieHeader, userFromToken } from "./auth";

export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AppError) {
      console.error(JSON.stringify({ level: "warn", code: error.code, message: error.message, at: new Date().toISOString() }));
      const headers: Record<string, string> = { "Cache-Control": "private, no-store" };
      if (error.details?.retryAfter) headers["Retry-After"] = error.details.retryAfter;
      return Response.json({ error: { code: error.code, message: error.message, details: error.details ?? null } }, { status: error.status, headers });
    }
    console.error(
      JSON.stringify({
        level: "error",
        code: "INTERNAL",
        message: error instanceof Error ? error.message : "unknown",
        at: new Date().toISOString(),
      }),
    );
    return json({ error: { code: "INTERNAL", message: "Something went wrong. No money was moved." } }, 500);
  }
}

export function assertSameOrigin(request: Request) {
  if (process.env.NODE_ENV === "test") return;
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) throw new AppError("ORIGIN", "This action must come from the app.", 403);
  let originHost = "";
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new AppError("ORIGIN", "This action must come from the app.", 403);
  }
  if (originHost !== host) throw new AppError("ORIGIN", "This action must come from the app.", 403);
}

export function idempotencyKey(request: Request): string {
  const key = request.headers.get("idempotency-key") ?? "";
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(key)) {
    throw new AppError("IDEMPOTENCY", "A valid Idempotency-Key header is required.", 400);
  }
  return key;
}

export async function readBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new AppError("INVALID_JSON", "The request body is not valid JSON.", 400);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new AppError("INVALID", parsed.error.issues[0]?.message ?? "Check the form and try again.", 400);
  }
  return parsed.data;
}

export async function actor(request: Request): Promise<User | null> {
  return userFromToken(tokenFromCookieHeader(request.headers.get("cookie")));
}

export async function requireUser(request: Request): Promise<User> {
  const user = await actor(request);
  if (!user) throw new AppError("UNAUTHENTICATED", "Sign in required.", 401);
  return user;
}

export async function requireAdminUser(request: Request): Promise<User> {
  const user = await actor(request);
  assertAdmin(user);
  if (isInvestorDemoIdentity(user)) throw new AppError("FORBIDDEN", "Admin access is required.", 403);
  return user as User;
}

export async function setSessionCookie(userId: string) {
  const session = await issueSession(userId);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: session.expiresAt,
  });
}

export async function clearSessionCookie(request: Request) {
  const token = tokenFromCookieHeader(request.headers.get("cookie"));
  await destroySession(token);
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}
