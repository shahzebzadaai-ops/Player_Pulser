import { z } from "zod";
import { cookies } from "next/headers";
import { linkVisitor } from "@/server/attribution";
import { loginWithPassword } from "@/server/auth";
import { assertSameOrigin, handle, json, readBody, setSessionCookie } from "@/server/http";

const schema = z.object({
  identifier: z.string().min(3),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const body = await readBody(request, schema);
    const user = await loginWithPassword(body.identifier, body.password);
    await setSessionCookie(user.id);
    const jar = await cookies();
    await linkVisitor(user.id, jar.get("pp_vid")?.value ?? null, "login");
    return json({ ok: true });
  });
}
