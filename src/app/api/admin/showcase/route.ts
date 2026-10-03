import { z } from "zod";
import { requirePermission } from "@/server/access";
import { clientIp } from "@/server/audit";
import { assertSameOrigin, handle, json, readBody } from "@/server/http";
import { generateShowcaseHistory, resetShowcaseHistory } from "@/server/showcase";

const schema = z.object({
  action: z.enum(["generate", "reset"]),
  reason: z.string(),
});

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const { user } = await requirePermission(request, "settings.manage");
    const body = await readBody(request, schema);
    if (body.action === "reset") {
      return json(await resetShowcaseHistory({ actorId: user.id, reason: body.reason, ip: clientIp(request) }));
    }
    return json(await generateShowcaseHistory({ actorId: user.id, reason: body.reason, ip: clientIp(request) }));
  });
}
