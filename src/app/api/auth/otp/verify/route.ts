import { z } from "zod";
import { cookies } from "next/headers";
import { authFlags } from "@/domain/auth-flags";
import { clientIp } from "@/server/audit";
import { linkVisitor, recordEvent } from "@/server/attribution";
import { verifyDevOtp } from "@/server/auth";
import { verifyEmailOtp } from "@/server/otp";
import { actor, assertSameOrigin, handle, json, readBody, setSessionCookie } from "@/server/http";
import { prisma } from "@/server/prisma";

const schema = z.object({
  challengeId: z.string(),
  code: z.string().regex(/^\d{6}$/, "Enter the 6 digit code."),
  acceptedTerms: z.boolean().optional(),
  acceptedAge: z.boolean().optional(),
  displayName: z.string().max(40).optional(),
  givenName: z.string().max(40).optional(),
  familyName: z.string().max(40).optional(),
});

export async function POST(request: Request) {
  const flags = authFlags();
  if (!flags.phoneOtpEnabled && !flags.emailOtpEnabled) return json({ error: { code: "NOT_FOUND", message: "Not found." } }, 404);
  return handle(async () => {
    assertSameOrigin(request);
    const body = await readBody(request, schema);
    const preview = await prisma.otpChallenge.findUnique({ where: { id: body.challengeId }, select: { channel: true } });
    const sessionUser = await actor(request);
    const consent = {
      accepted: body.acceptedTerms === true,
      acceptedAge: body.acceptedAge === true,
      displayName: body.displayName,
      givenName: body.givenName,
      familyName: body.familyName,
      ip: clientIp(request),
      userAgent: request.headers.get("user-agent"),
      visitorId: (await cookies()).get("pp_vid")?.value ?? null,
      sessionUserId: sessionUser?.id ?? null,
    };
    const user = preview?.channel === "EMAIL"
      ? await verifyEmailOtp(body.challengeId, body.code, consent)
      : await verifyDevOtp(body.challengeId, body.code, consent, true);
    await setSessionCookie(user.id);
    const jar = await cookies();
    const createdNow = Date.now() - user.createdAt.getTime() < 120_000;
    await recordEvent({ eventName: "OTP_VERIFIED", dedupeKey: `otp:${body.challengeId}`, userId: user.id });
    await recordEvent({ eventName: "otp_verified", dedupeKey: `otp-v:${body.challengeId}`, userId: user.id });
    await linkVisitor(user.id, jar.get("pp_vid")?.value ?? null, createdNow ? "signup" : "login");
    const grant = createdNow
      ? await prisma.bonusGrant.findUnique({ where: { userId_source: { userId: user.id, source: "WELCOME" } } })
      : null;
    return json({
      ok: true,
      created: createdNow,
      bonusStatus: grant?.status ?? null,
      needsProfile: createdNow,
    });
  });
}
