import { z } from "zod";
import { cookies } from "next/headers";
import { AppError } from "@/domain/errors";
import { clientIp } from "@/server/audit";
import { linkVisitor } from "@/server/attribution";
import { signup } from "@/server/auth";
import { assertSameOrigin, handle, readBody, setSessionCookie, json } from "@/server/http";
import { prisma } from "@/server/prisma";
import { assertDurableRate } from "@/server/rate-limit";

const schema = z.object({
  method: z.enum(["phone", "email"]),
  phone: z.string().optional(),
  email: z.string().optional(),
  password: z.string(),
  displayName: z.string().optional(),
  acceptedTerms: z.boolean(),
});

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    await assertDurableRate("signup", clientIp(request) ?? "local", 10 * 60_000, 8);
    const body = await readBody(request, schema);
    if (!body.acceptedTerms) throw new AppError("CONSENT", "Agree to the Terms of Use and Privacy Policy.", 400);
    const jar = await cookies();
    const user = await signup({
      ...body,
      ip: clientIp(request),
      userAgent: request.headers.get("user-agent"),
      visitorId: jar.get("pp_vid")?.value ?? null,
    });
    await setSessionCookie(user.id);
    await linkVisitor(user.id, jar.get("pp_vid")?.value ?? null, "signup");
    const grant = await prisma.bonusGrant.findUnique({ where: { userId_source: { userId: user.id, source: "WELCOME" } } });
    return json({ ok: true, bonusStatus: grant?.status ?? null });
  });
}
