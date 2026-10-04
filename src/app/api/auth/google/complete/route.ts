import { z } from "zod";
import { clientIp } from "@/server/audit";
import { linkVisitor } from "@/server/attribution";
import { completeGoogleSignup } from "@/server/google-auth";
import { assertSameOrigin, handle, json, readBody, setSessionCookie } from "@/server/http";
import { cookies } from "next/headers";

const schema = z.object({
  givenName: z.string(),
  familyName: z.string(),
  username: z.string().optional(),
  referralCode: z.string().max(40).optional(),
  acceptedAge: z.boolean(),
  acceptedTerms: z.boolean(),
});

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const body = await readBody(request, schema);
    const jar = await cookies();
    const result = await completeGoogleSignup({
      ...body,
      ip: clientIp(request),
      userAgent: request.headers.get("user-agent"),
      visitorId: jar.get("pp_vid")?.value ?? null,
    });
    await setSessionCookie(result.userId);
    await linkVisitor(result.userId, jar.get("pp_vid")?.value ?? null, "signup");
    return json({ ok: true });
  });
}
