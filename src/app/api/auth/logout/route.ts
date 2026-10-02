import { assertSameOrigin, clearSessionCookie, handle, json } from "@/server/http";

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    await clearSessionCookie(request);
    return json({ ok: true });
  });
}
