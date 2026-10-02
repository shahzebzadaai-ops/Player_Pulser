import { z } from "zod";
import { collectVisit, visitorCookieIds } from "@/server/attribution";
import { actor, assertSameOrigin, handle, json, readBody } from "@/server/http";

const schema = z.object({
  pathname: z.string().max(300),
  search: z.string().max(1000).optional(),
  referrer: z.string().max(500).optional(),
});

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const body = await readBody(request, schema);
    const ids = visitorCookieIds(request.headers.get("cookie"));
    const user = await actor(request);
    await collectVisit({
      visitorId: ids.visitorId,
      sessionId: ids.sessionId,
      pathname: body.pathname,
      search: body.search ?? "",
      referrer: body.referrer ?? null,
      user: user ? { id: user.id, role: user.role } : null,
    });
    return json({ ok: true });
  });
}
