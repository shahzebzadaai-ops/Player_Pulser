import { assertSameOrigin, handle, json, requireUser } from "@/server/http";
import { registrationOptions } from "@/server/passkeys";

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireUser(request);
    return json(await registrationOptions(request, user));
  });
}
