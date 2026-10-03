import { isInvestorDemoIdentity } from "@/domain/investor-demo";
import { AppError } from "@/domain/errors";
import { resetInvestorDemo } from "@/server/investor-demo";
import { assertSameOrigin, handle, json, requireUser } from "@/server/http";

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireUser(request);
    if (!isInvestorDemoIdentity(user)) throw new AppError("FORBIDDEN", "Only the investor demo can be reset.", 403);
    await resetInvestorDemo(user.id);
    return json({ ok: true });
  });
}
