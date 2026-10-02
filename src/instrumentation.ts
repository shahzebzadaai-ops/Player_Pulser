export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { startRealtimeListener } = await import("@/server/realtime");
  const { startExternalMarkets } = await import("@/server/external-markets");
  await startRealtimeListener();
  startExternalMarkets();
}
