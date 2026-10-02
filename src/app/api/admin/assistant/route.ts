import { z } from "zod";
import { requirePermission } from "@/server/access";
import { contentAssistant } from "@/server/content-assistant";
import { assertSameOrigin, handle, json, readBody } from "@/server/http";

const schema = z.object({
  method: z.enum(["generateHeadline", "generateSubtitle", "generateSeoDescription", "generatePushCopy", "generateWhatsAppCopy"]),
  placement: z.string().optional(),
  name: z.string().optional(),
  playerName: z.string().optional(),
  topic: z.string().optional(),
});

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    await requirePermission(request, "content.manage");
    const body = await readBody(request, schema);
    const assistant = contentAssistant();
    const text = await assistant[body.method](body);
    return json({ text });
  });
}
