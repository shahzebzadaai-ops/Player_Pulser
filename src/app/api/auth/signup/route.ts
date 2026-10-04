import { z } from "zod";
import { cookies } from "next/headers";
import { AppError } from "@/domain/errors";
import { AGE_CONSENT_MESSAGE, ageConsentAccepted, registrationIssues } from "@/domain/registration";
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
  givenName: z.string().optional(),
  familyName: z.string().optional(),
  username: z.string().optional(),
  referralCode: z.string().max(40).optional(),
  acceptedTerms: z.boolean(),
  acceptedAge: z.boolean(),
});

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    await assertDurableRate("signup", clientIp(request) ?? "local", 10 * 60_000, 8);
    const body = await readBody(request, schema);
    if (!ageConsentAccepted(body)) throw new AppError("CONSENT", AGE_CONSENT_MESSAGE, 400);
    if (body.method === "email") {
      const issues = registrationIssues({
        givenName: body.givenName ?? "",
        familyName: body.familyName ?? "",
        email: body.email ?? "",
        username: body.username ?? "",
        password: body.password,
        acceptedAge: body.acceptedAge,
        acceptedTerms: body.acceptedTerms,
      });
      const first = Object.values(issues)[0];
      if (first) throw new AppError("INVALID", first, 400);
    }
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
