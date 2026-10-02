import "./worker-env";
import { expireBonusGrant } from "@/server/bonus";
import { markBonusExpiryRun, markOps, markPaymentRetryRun, markWorkerHeartbeat } from "@/server/ops-status";
import { expireStalePayments, retryPendingPayments } from "@/server/payments";
import { dbDiagnostics } from "@/server/db-diagnostics";
import { prisma } from "@/server/prisma";
import { runCricbuzzShadow, runFeedCycle } from "@/server/feed";
import { runConsensusShadow } from "@/server/consensus-feed";
import { advancePreparedShadowMatches } from "@/server/match-prepare";
import { maintainPrices } from "@/server/price-cycle";
import { runPulsePreview } from "@/server/pulse-preview";
import { backfillPlayerRiskControls } from "@/server/risk";
import { withUserLock } from "@/server/ledger";

async function expireBonuses() {
  const due = await prisma.bonusGrant.findMany({
    where: { status: "ACTIVE", expiresAt: { lte: new Date() } },
    take: 20,
  });
  for (const grant of due) {
    await withUserLock(grant.userId, (tx) => expireBonusGrant(tx, grant.id));
  }
}

let cycleRunning = false;

async function cycle() {
  if (cycleRunning) {
    console.log(JSON.stringify({ level: "info", message: "worker cycle skipped; previous iteration still running", at: new Date().toISOString() }));
    return;
  }
  cycleRunning = true;
  const started = Date.now();
  try {
    await markWorkerHeartbeat();
    await backfillPlayerRiskControls();
    await runFeedCycle();
    await runCricbuzzShadow();
    await advancePreparedShadowMatches();
    await runConsensusShadow();
    await maintainPrices();
    await expireBonuses();
    await markBonusExpiryRun();
    await expireStalePayments();
    const retried = await retryPendingPayments();
    await markPaymentRetryRun(retried);
  } finally {
    const iterationMs = Date.now() - started;
    const diagnostics = dbDiagnostics();
    console.log(JSON.stringify({
      level: "info",
      message: "worker cycle finished",
      iterationMs,
      active: diagnostics.active,
      poolTimeouts: diagnostics.poolTimeouts,
      at: new Date().toISOString(),
    }));
    await markOps("ops.workerDb", JSON.stringify({
      iterationMs,
      connectionLimit: diagnostics.connectionLimit,
      poolTimeout: diagnostics.poolTimeout,
      poolTimeouts: diagnostics.poolTimeouts,
      slowQueries: diagnostics.slowQueries,
      at: new Date().toISOString(),
    })).catch(() => undefined);
    cycleRunning = false;
  }
}

let pulseRunning = false;

async function pulseTask() {
  if (pulseRunning) return;
  pulseRunning = true;
  try {
    await runPulsePreview();
  } catch (error) {
    console.error(JSON.stringify({ level: "error", message: error instanceof Error ? error.message : "pulse preview", at: new Date().toISOString() }));
  } finally {
    pulseRunning = false;
  }
}

console.log(JSON.stringify({ level: "info", message: "PlayerPulser worker started", at: new Date().toISOString() }));
void cycle().catch((error) => {
  console.error(JSON.stringify({ level: "error", message: error instanceof Error ? error.message : "worker", at: new Date().toISOString() }));
});
void pulseTask();
const timer = setInterval(() => {
  cycle().catch((error) => {
    console.error(JSON.stringify({ level: "error", message: error instanceof Error ? error.message : "worker", at: new Date().toISOString() }));
  });
}, 5000);
const pulseTimer = setInterval(() => {
  void pulseTask();
}, 5000);

function shutdown() {
  clearInterval(timer);
  clearInterval(pulseTimer);
  void prisma.$disconnect().finally(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
