import { z } from "zod";
import { SUGGESTED_QUESTIONS } from "@/domain/bittu-help";
import { clientIp } from "@/server/audit";
import { answerBittu } from "@/server/bittu-chat";
import { assertSameOrigin, handle, json, readBody } from "@/server/http";
import { assertDurableRate } from "@/server/rate-limit";

const schema = z.object({
  message: z.string().trim().min(1, "Enter a question.").max(400, "Keep the question under 400 characters."),
});

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    await assertDurableRate("bittu-help", clientIp(request) ?? "local", 10 * 60_000, 20);
    const body = await readBody(request, schema);
    const reply = await answerBittu(body.message);
    return json({ ...reply, suggestions: SUGGESTED_QUESTIONS });
  });
}
