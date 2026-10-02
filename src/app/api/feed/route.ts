import { json } from "@/server/http";
import { publicPricePayload } from "@/server/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  return json(await publicPricePayload());
}
