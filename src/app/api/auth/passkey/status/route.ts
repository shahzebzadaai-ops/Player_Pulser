import { cookies } from "next/headers";
import { PASSKEY_SKIP_COOKIE, passkeyOfferEligible } from "@/server/passkeys";
import { handle, json, requireUser } from "@/server/http";

export async function GET(request: Request) {
  return handle(async () => {
    const user = await requireUser(request);
    const skipped = (await cookies()).get(PASSKEY_SKIP_COOKIE)?.value === "1";
    const eligible = !skipped && await passkeyOfferEligible(user.id);
    return json({ eligible });
  });
}
