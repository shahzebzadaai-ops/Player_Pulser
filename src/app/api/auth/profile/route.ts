import { z } from "zod";
import { normalizeEmail } from "@/domain/identities";
import { INVESTOR_DEMO_EMAIL } from "@/domain/investor-demo";
import { AppError } from "@/domain/errors";
import { normalizeUsername, suggestUsernames } from "@/domain/username";
import { recordEvent } from "@/server/attribution";
import { assertSameOrigin, handle, json, readBody, requireUser } from "@/server/http";
import { prisma } from "@/server/prisma";

const CONSENT_VERSION = "2026-10-03";

const schema = z.object({
  givenName: z.string().trim().min(1).max(40),
  familyName: z.string().trim().min(1, "Enter your last name.").max(40),
  username: z.string().trim().max(24).optional(),
  email: z.string().max(200).optional(),
  marketingConsent: z.boolean().optional(),
  doNotEmail: z.boolean().optional(),
  doNotSms: z.boolean().optional(),
  doNotWhatsApp: z.boolean().optional(),
  doNotCall: z.boolean().optional(),
});

export async function GET(request: Request) {
  return handle(async () => {
    const user = await requireUser(request);
    const suggestions = suggestUsernames(user.givenName ?? "", user.familyName ?? "");
    return json({
      givenName: user.givenName,
      familyName: user.familyName,
      username: user.username,
      suggestion: user.usernameCustomized ? user.username : suggestions[0],
    });
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireUser(request);
    const body = await readBody(request, schema);
    const email = body.email ? normalizeEmail(body.email) : null;
    if (body.email && !email) throw new AppError("INVALID", "Enter a valid email address.", 400);
    if (email === INVESTOR_DEMO_EMAIL) throw new AppError("INVALID", "Enter a valid email address.", 400);
    if (email && email !== user.email) {
      const taken = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (taken) throw new AppError("EXISTS", "That email is already in use.", 409);
    }
    const familyName = body.familyName.trim();
    const username = body.username ? normalizeUsername(body.username) : null;
    if (body.username && !username) throw new AppError("INVALID", "Use 3–24 letters, numbers, dots, or underscores.", 400);
    if (username) {
      const taken = await prisma.user.findFirst({ where: { usernameNormalized: username, NOT: { id: user.id } }, select: { id: true } });
      if (taken) throw new AppError("EXISTS", "That username is already taken.", 409);
    }
    const consent = body.marketingConsent === true;
    const nextStatus = user.accountStatus === "RESTRICTED" || user.accountStatus === "VERIFIED" || user.accountStatus === "VERIFICATION_REQUIRED"
      ? user.accountStatus
      : "PROFILE_COMPLETE";
    await prisma.user.update({
      where: { id: user.id },
      data: {
        givenName: body.givenName,
        familyName,
        displayName: [body.givenName, familyName].filter(Boolean).join(" "),
        ...(username ? { username, usernameNormalized: username, usernameCustomized: true } : {}),
        email: email ?? user.email,
        accountStatus: nextStatus,
        ...(body.marketingConsent !== undefined
          ? {
              marketingConsent: consent,
              ...(consent
                ? {
                    marketingConsentAt: new Date(),
                    marketingConsentSource: "settings",
                    marketingConsentVersion: CONSENT_VERSION,
                  }
                : {}),
            }
          : {}),
        ...(body.doNotEmail !== undefined ? { doNotEmail: body.doNotEmail } : {}),
        ...(body.doNotSms !== undefined ? { doNotSms: body.doNotSms } : {}),
        ...(body.doNotWhatsApp !== undefined ? { doNotWhatsApp: body.doNotWhatsApp } : {}),
        ...(body.doNotCall !== undefined ? { doNotCall: body.doNotCall } : {}),
      },
    });
    await recordEvent({ eventName: "profile_completed", dedupeKey: `profile:${user.id}:${Date.now()}`, userId: user.id });
    return json({ ok: true });
  });
}