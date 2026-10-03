import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { AppError } from "@/domain/errors";
import { assertSameOrigin, handle, json } from "@/server/http";
import { verifyAuthentication } from "@/server/passkeys";

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const body = (await request.json().catch(() => null)) as AuthenticationResponseJSON | null;
    if (!body) throw new AppError("INVALID", "We couldn't sign you in. Please try again.", 400);
    await verifyAuthentication(request, body);
    return json({ ok: true });
  });
}
