import { clientIp, writeAudit } from "@/server/audit";
import { actor, assertSameOrigin, clearSessionCookie, handle, json } from "@/server/http";

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await actor(request);
    await clearSessionCookie(request);
    if (user?.role === "ADMIN") {
      await writeAudit({
        actorId: user.id,
        action: "admin.logout",
        entityType: "User",
        entityId: user.id,
        ip: clientIp(request),
      });
    }
    return json({ ok: true });
  });
}
