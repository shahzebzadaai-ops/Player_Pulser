import { z } from "zod";
import { authFlags } from "@/domain/auth-flags";
import { AppError } from "@/domain/errors";
import { devAuthAllowed, normalizeIndianPhone } from "@/domain/phone";
import { requestDevOtp } from "@/server/auth";
import { publicOtpPayload, requestEmailOtp, requestPhoneOtp } from "@/server/otp";
import { assertSameOrigin, handle, json, readBody } from "@/server/http";

const schema = z.object({
  phone: z.string().optional(),
  email: z.string().optional(),
  channel: z.enum(["PHONE", "EMAIL"]).optional(),
});

export async function POST(request: Request) {
  const flags = authFlags();
  if (!flags.phoneOtpEnabled && !flags.emailOtpEnabled) return json({ error: { code: "NOT_FOUND", message: "Not found." } }, 404);
  return handle(async () => {
    assertSameOrigin(request);
    const body = await readBody(request, schema);
    if (body.channel === "EMAIL" || (body.email && !body.phone)) {
      return json(publicOtpPayload(await requestEmailOtp(body.email ?? "")));
    }
    if (!body.phone) throw new AppError("INVALID", "Enter a mobile number or email.", 400);
    if (devAuthAllowed() && normalizeIndianPhone(body.phone)) {
      return json(await requestDevOtp(body.phone));
    }
    return json(publicOtpPayload(await requestPhoneOtp(body.phone)));
  });
}
