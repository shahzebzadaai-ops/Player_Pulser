import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { AppError } from "@/domain/errors";
import { assertSameOrigin, handle, json, requireUser } from "@/server/http";
import { verifyRegistration } from "@/server/passkeys";

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireUser(request);
    const body = (await request.json().catch(() => null)) as RegistrationResponseJSON | null;
    if (!body) throw new AppError("INVALID", "We couldn't set up device sign-in. Please try again.", 400);
    await verifyRegistration(request, user.id, body);
    return json({ ok: true });
  });
}
