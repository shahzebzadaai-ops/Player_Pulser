import { newsDesk } from "@/server/news-pulse";
import { handle, json, requireUser } from "@/server/http";

export async function GET(request: Request) {
  return handle(async () => {
    const user = await requireUser(request);
    const playerId = new URL(request.url).searchParams.get("playerId") ?? undefined;
    return json(await newsDesk(user.id, playerId || undefined));
  });
}
