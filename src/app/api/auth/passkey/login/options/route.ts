import { assertSameOrigin, handle, json } from "@/server/http";
import { authenticationOptions } from "@/server/passkeys";

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    return json(await authenticationOptions(request));
  });
}
