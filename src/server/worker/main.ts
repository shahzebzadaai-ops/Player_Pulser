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
import { getSettings } from "@/server/settings";
import { simulationCycleMs } from "@/domain/settings";
import { runPulsePreview } from "@/server/pulse-preview";
import { runNewsPulseCycle } from "@/server/news-pulse";
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

let priceRunning = false;
let priceTimer: ReturnType<typeof setTimeout> | undefined;

async function priceTask() {
  if (priceRunning) return;
  priceRunning = true;
  try {
    await maintainPrices();
  } catch (error) {
    console.error(JSON.stringify({ level: "error", message: error instanceof Error ? error.message : "price cycle", at: new Date().toISOString() }));
  } finally {
    priceRunning = false;
  }
}

async function schedulePrices() {
  const started = Date.now();
  await priceTask();
  const settings = await getSettings().catch(() => null);
  const wait = simulationCycleMs(settings?.simulationCycleMs);
  const delay = Math.max(0, wait - (Date.now() - started));
  priceTimer = setTimeout(() => {
    void schedulePrices();
  }, delay);
}

console.log(JSON.stringify({ level: "info", message: "PlayerPulser worker started", at: new Date().toISOString() }));
void cycle().catch((error) => {
  console.error(JSON.stringify({ level: "error", message: error instanceof Error ? error.message : "worker", at: new Date().toISOString() }));
});
void schedulePrices().catch((error) => {
  console.error(JSON.stringify({ level: "error", message: error instanceof Error ? error.message : "price schedule", at: new Date().toISOString() }));
});
void pulseTask();
let newsRunning = false;
async function newsTask() {
  if (newsRunning) return;
  newsRunning = true;
  try {
    await runNewsPulseCycle();
  } catch (error) {
    console.error(JSON.stringify({ level: "error", message: error instanceof Error ? error.message : "news pulse", at: new Date().toISOString() }));
  } finally {
    newsRunning = false;
  }
}
const timer = setInterval(() => {
  cycle().catch((error) => {
    console.error(JSON.stringify({ level: "error", message: error instanceof Error ? error.message : "worker", at: new Date().toISOString() }));
  });
}, 5000);
const pulseTimer = setInterval(() => {
  void pulseTask();
}, 5000);
const newsTimer = setInterval(() => {
  void newsTask();
}, 7 * 60 * 1000);
const newsStart = setTimeout(() => {
  void newsTask();
}, 20_000);

function shutdown() {
  clearInterval(timer);
  clearInterval(pulseTimer);
  clearInterval(newsTimer);
  clearTimeout(newsStart);
  if (priceTimer) clearTimeout(priceTimer);
  void prisma.$disconnect().finally(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
