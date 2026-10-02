import { priceHistory } from "@/server/queries";
import { handle, json, requireUser } from "@/server/http";

const RANGES = new Set(["1H", "24H", "7D", "30D", "ALL"]);

export async function GET(request: Request, context: { params: Promise<{ playerId: string }> }) {
  return handle(async () => {
    await requireUser(request);
    const { playerId } = await context.params;
    const range = new URL(request.url).searchParams.get("range") ?? "24H";
    const history = await priceHistory(playerId, RANGES.has(range) ? range : "24H");
    return json(history);
  });
}
