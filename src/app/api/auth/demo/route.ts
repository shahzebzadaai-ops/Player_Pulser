import { clientIp } from "@/server/audit";
import { enterInvestorDemo } from "@/server/investor-demo";
import { assertDurableRate } from "@/server/rate-limit";
import { assertSameOrigin, handle, json, setSessionCookie } from "@/server/http";

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    await assertDurableRate("investor-demo", clientIp(request) ?? "local", 10 * 60_000, 12);
    const userId = await enterInvestorDemo();
    await setSessionCookie(userId);
    return json({ ok: true });
  });
}
