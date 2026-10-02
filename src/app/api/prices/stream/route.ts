import { heartbeatFrame, HEARTBEAT_MS, SSE_HEADERS } from "@/domain/live-prices";
import { externalMarketSnapshot, startExternalMarkets } from "@/server/external-markets";
import { addSseClient, noteCustomerStream, startRealtimeListener } from "@/server/realtime";
import { publicPricePayload } from "@/server/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  await startRealtimeListener();
  startExternalMarkets();
  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let remove = () => {};
  let closed = false;
  const stream = new ReadableStream({
    start(controller) {
      const enqueue = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };
      const sendSnapshot = async () => {
        const payload = { ...(await publicPricePayload()), markets: externalMarketSnapshot() };
        enqueue(`data: ${JSON.stringify(payload)}\n\n`);
        await noteCustomerStream();
      };
      remove = addSseClient((chunk) => {
        if (closed) return;
        try {
          controller.enqueue(chunk);
        } catch {
          closed = true;
        }
      });
      enqueue(heartbeatFrame(new Date().toISOString()));
      void sendSnapshot().catch(() => undefined);
      heartbeat = setInterval(() => enqueue(heartbeatFrame(new Date().toISOString())), HEARTBEAT_MS);
    },
    cancel() {
      closed = true;
      remove();
      if (heartbeat) clearInterval(heartbeat);
    },
  });
  return new Response(stream, { headers: SSE_HEADERS });
}
