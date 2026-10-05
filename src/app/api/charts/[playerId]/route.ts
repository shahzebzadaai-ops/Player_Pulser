import { historyWindow } from "@/domain/live-prices";
import { priceHistory } from "@/server/queries";
import { handle, json } from "@/server/http";

export async function GET(request: Request, context: { params: Promise<{ playerId: string }> }) {
  return handle(async () => {
    const { playerId } = await context.params;
    const range = new URL(request.url).searchParams.get("range") ?? "1D";
    const history = await priceHistory(playerId, historyWindow(range));
    return json(history);
  });
}
