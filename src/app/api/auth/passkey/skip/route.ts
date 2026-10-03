import { assertSameOrigin, handle, json } from "@/server/http";
import { skipPasskeyOffer } from "@/server/passkeys";

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    await skipPasskeyOffer();
    return json({ ok: true });
  });
}
