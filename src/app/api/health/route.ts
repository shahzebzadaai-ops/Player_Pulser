import { prisma } from "@/server/prisma";

export const dynamic = "force-dynamic";

const WORKER_ALIVE_MS = 60_000;

export async function GET() {
  let database = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    database = true;
  } catch {
    database = false;
  }

  let worker: "alive" | "stale" | "down" = "down";
  if (database) {
    const beat = await prisma.appSetting.findUnique({ where: { key: "ops.workerHeartbeat" } });
    const raw = typeof beat?.value === "string" ? Date.parse(beat.value) : Number.NaN;
    if (!Number.isNaN(raw)) {
      worker = Date.now() - raw <= WORKER_ALIVE_MS ? "alive" : "stale";
    }
  }

  return Response.json({
    ok: database,
    web: "alive",
    database: database ? "reachable" : "down",
    worker,
  });
}
