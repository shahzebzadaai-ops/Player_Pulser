import { z } from "zod";
import { markNewsSeen } from "@/server/news-pulse";
import { assertSameOrigin, handle, json, readBody, requireUser } from "@/server/http";

const schema = z.object({
  ids: z.array(z.string().min(1)).max(40),
});

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireUser(request);
    const body = await readBody(request, schema);
    await markNewsSeen(user.id, body.ids);
    return json({ ok: true });
  });
}
