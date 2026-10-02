import { addSseClient, noteCustomerStream, startRealtimeListener } from "@/server/realtime";
import { publicPricePayload } from "@/server/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  await startRealtimeListener();
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;
  let remove = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = async () => {
        const payload = await publicPricePayload();
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        await noteCustomerStream();
      };
      remove = addSseClient((chunk) => controller.enqueue(chunk));
      void send().catch(() => undefined);
      timer = setInterval(() => {
        send().catch(() => undefined);
      }, 8000);
    },
    cancel() {
      remove();
      if (timer) clearInterval(timer);
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "private, no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
