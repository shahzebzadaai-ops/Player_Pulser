import { z } from "zod";
import { devAuthAllowed } from "@/domain/phone";
import { requestDevOtp } from "@/server/auth";
import { assertSameOrigin, handle, json, readBody } from "@/server/http";

const schema = z.object({ phone: z.string() });

export async function POST(request: Request) {
  if (!devAuthAllowed()) return json({ error: { code: "NOT_FOUND", message: "Not found." } }, 404);
  return handle(async () => {
    assertSameOrigin(request);
    const body = await readBody(request, schema);
    const challenge = await requestDevOtp(body.phone);
    return json(challenge);
  });
}
