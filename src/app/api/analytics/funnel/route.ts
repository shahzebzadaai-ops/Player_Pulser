import { z } from "zod";
import { cookies } from "next/headers";
import { ANALYTICS_EVENTS } from "@/domain/attribution";
import { marketingPayload } from "@/domain/growth";
import { recordEvent } from "@/server/attribution";
import { assertSameOrigin, handle, json, readBody } from "@/server/http";
import { getCurrentUser } from "@/server/current-user";
import { prisma } from "@/server/prisma";
import { VISITOR_COOKIE, VISIT_COOKIE } from "@/server/visit-cookies";

const PUBLIC_EVENTS = [
  "LANDING_VIEW",
  "SIGNUP_PROMPT_SHOWN",
  "SIGNUP_STARTED",
  "DEPOSIT_PAGE_VIEWED",
  "PAYMENT_METHOD_SELECTED",
] as const;

const schema = z.object({
  eventName: z.enum(PUBLIC_EVENTS),
  dedupeKey: z.string().min(8).max(80),
});

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const body = await readBody(request, schema);
    if (!ANALYTICS_EVENTS.includes(body.eventName)) return json({ ok: false });
    const jar = await cookies();
    const user = await getCurrentUser();
    const visitorId = jar.get(VISITOR_COOKIE)?.value ?? null;
    const sessionId = jar.get(VISIT_COOKIE)?.value ?? null;
    const [visitor, session] = await Promise.all([
      visitorId ? prisma.visitor.findUnique({ where: { id: visitorId }, select: { id: true } }) : null,
      sessionId ? prisma.visitSession.findUnique({ where: { id: sessionId }, select: { id: true } }) : null,
    ]);
    await recordEvent({
      eventName: body.eventName,
      dedupeKey: body.dedupeKey,
      visitorId: visitor?.id ?? null,
      sessionId: session?.id ?? null,
      userId: user?.role === "ADMIN" ? null : user?.id ?? null,
      metadata: marketingPayload({}),
    });
    return json({ ok: true });
  });
}
