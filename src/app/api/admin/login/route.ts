import { z } from "zod";
import { ADMIN_LOGIN_ERROR } from "@/domain/admin-access";
import { loginAdmin } from "@/server/admin-login";
import { assertSameOrigin, handle, json, readBody, setSessionCookie } from "@/server/http";

const schema = z.object({
  username: z.string().min(1, ADMIN_LOGIN_ERROR).max(80, ADMIN_LOGIN_ERROR),
  password: z.string().min(1, ADMIN_LOGIN_ERROR).max(200, ADMIN_LOGIN_ERROR),
});

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const body = await readBody(request, schema);
    const user = await loginAdmin(body.username, body.password, request);
    await setSessionCookie(user.id);
    return json({ ok: true });
  });
}
