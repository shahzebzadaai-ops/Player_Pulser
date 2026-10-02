import { z } from "zod";
import { cookies } from "next/headers";
import { devAuthAllowed } from "@/domain/phone";
import { linkVisitor } from "@/server/attribution";
import { devLogin } from "@/server/auth";
import { assertSameOrigin, handle, json, readBody, setSessionCookie } from "@/server/http";

const schema = z.object({ phone: z.string() });

export async function POST(request: Request) {
  if (!devAuthAllowed()) return json({ error: { code: "NOT_FOUND", message: "Not found." } }, 404);
  return handle(async () => {
    assertSameOrigin(request);
    const body = await readBody(request, schema);
    const user = await devLogin(body.phone);
    await setSessionCookie(user.id);
    const jar = await cookies();
    await linkVisitor(user.id, jar.get("pp_vid")?.value ?? null, "login");
    return json({ ok: true });
  });
}
