import { currentGoogleSignup } from "@/server/intent-cookie";
import { handle, json } from "@/server/http";

export async function GET() {
  return handle(async () => {
    const pending = await currentGoogleSignup();
    if (!pending) return json({ pending: false });
    return json({
      pending: true,
      email: pending.email,
      givenName: pending.givenName,
      familyName: pending.familyName,
    });
  });
}
