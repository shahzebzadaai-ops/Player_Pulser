import { FEATURE_LABELS, HIGH_IMPACT_FEATURES } from "@/domain/features";
import { isChurnRisk, isHighValue } from "@/domain/crm";
import { attentionItems, type AttentionItem } from "@/domain/reporting";
import { isUsableConsensusSource } from "@/domain/consensus-feed";
import { shadowMatchNeedsAttention } from "@/domain/shadow-validation";
import { getFeatureFlags } from "./features";
import { getSystemHealth } from "./ops-status";
import { prisma } from "./prisma";
import { riskOverview } from "./risk";
import { getSettings } from "./settings";

export async function getAttentionItems(): Promise<AttentionItem[]> {
  const now = new Date();
  const soon = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const [pendingWithdrawals, paymentsNeedingAttention, health, bannersExpiring, flags, settings, openFeedIncidents, shadowMatches, cricketSources] = await Promise.all([
    prisma.payment.count({ where: { kind: "PAYOUT", status: "PENDING" } }),
    prisma.payment.count({ where: { OR: [{ status: "FAILED" }, { status: "PENDING", attemptCount: { gt: 0 } }] } }),
    getSystemHealth(),
    prisma.banner.count({ where: { status: { in: ["LIVE", "SCHEDULED"] }, endAt: { gt: now, lte: soon } } }),
    getFeatureFlags(),
    getSettings(),
    prisma.feedIncident.count({ where: { resolvedAt: null } }),
    shadowMatchesNeedingAttention(),
    prisma.feedSourceState.findMany({ where: { source: { in: ["CREX", "Sportskeeda", "Cricbuzz"] } } }),
  ]);
  const [highValueChurn, risk] = await Promise.all([
    countHighValueChurn(settings.highValueDepositThresholdPaise, settings.churnRiskInactiveDays, now),
    riskOverview(),
  ]);
  const disabledFeatures = HIGH_IMPACT_FEATURES.filter((key) => !flags[key]).map((key) => FEATURE_LABELS[key].label);
  const items = attentionItems({
    pendingWithdrawals,
    paymentsNeedingAttention,
    worker: health.worker,
    bannersExpiring,
    highValueChurn,
    disabledFeatures,
    riskAlerts: risk.alerts,
    openFeedIncidents,
    shadowMatches,
    singleCricketSource: cricketSources.filter((source) => isUsableConsensusSource(source)).length === 1,
    feedAlerts: await preparationAlerts(now),
  });
  if (flags.pulsePreviewEnabled) {
    const latest = await prisma.pulsePreviewCycle.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } });
    if (!latest || now.getTime() - latest.createdAt.getTime() > 45_000) {
      items.push({ label: "Simulation preview has not ticked", href: "/admin/market/pulse" });
    }
  }
  return items;
}

async function shadowMatchesNeedingAttention(): Promise<{ matchId: string; label: string }[]> {
  const source = await prisma.feedSourceState.findUnique({ where: { source: "Cricbuzz" } });
  if (!source || source.operatingMode !== "SHADOW") return [];
  const matches = await prisma.cricketMatch.findMany({
    where: { status: { notIn: ["COMPLETED", "ABANDONED"] }, externalIds: { some: { source: "Cricbuzz" } } },
    select: { id: true, homeTeam: true, awayTeam: true },
  });
  if (matches.length === 0) return [];
  const ids = matches.map((match) => match.id);
  const [gaps, incidents] = await Promise.all([
    prisma.feedHighWater.findMany({
      where: { source: "Cricbuzz", matchId: { in: ids }, continuity: "UNRESOLVED_GAP" },
      select: { matchId: true },
    }),
    prisma.feedIncident.findMany({
      where: {
        resolvedAt: null,
        matchId: { in: ids },
        type: { in: ["UNRESOLVED_GAP", "MAPPING_BLOCKER", "RECONCILIATION_CONFLICT"] },
      },
      select: { matchId: true, type: true },
    }),
  ]);
  const gapIds = new Set(gaps.map((row) => row.matchId));
  const blockers = new Set(incidents.filter((row) => row.type === "MAPPING_BLOCKER").map((row) => row.matchId));
  const conflicts = new Set(incidents.filter((row) => row.type === "RECONCILIATION_CONFLICT").map((row) => row.matchId));
  return matches
    .filter((match) => shadowMatchNeedsAttention({
      unresolvedGap: gapIds.has(match.id),
      sourceDown: source.status === "DOWN",
      mappingBlocker: blockers.has(match.id),
      reconciliationConflict: conflicts.has(match.id),
    }))
    .map((match) => ({ matchId: match.id, label: `${match.homeTeam} vs ${match.awayTeam}` }));
}

async function preparationAlerts(now: Date): Promise<{ label: string; href: string }[]> {
  const soon = new Date(now.getTime() + 6 * 60 * 60 * 1000);
  const items: { label: string; href: string }[] = [];
  const unlinked = await prisma.discoveredCricketMatch.findMany({
    where: { indiaInternational: true, importedMatchId: null, scheduledAt: { gt: now, lte: soon } },
    take: 3,
  });
  for (const row of unlinked) {
    items.push({ label: `${row.homeTeam} vs ${row.awayTeam} is not linked on ${row.source}`, href: "/admin/market/live" });
  }
  const prepared = await prisma.cricketMatch.findMany({
    where: {
      status: "SCHEDULED",
      scheduledAt: { lte: soon },
      externalIds: { some: { source: { in: ["CREX", "Sportskeeda", "Cricbuzz"] } } },
    },
    select: { id: true, homeTeam: true, awayTeam: true, externalIds: { select: { source: true } } },
    take: 5,
  });
  for (const match of prepared) {
    const linked = new Set(match.externalIds.map((row) => row.source));
    const count = ["CREX", "Sportskeeda", "Cricbuzz"].filter((source) => linked.has(source)).length;
    if (count === 1) {
      items.push({ label: `${match.homeTeam} vs ${match.awayTeam} has only one feed source`, href: `/admin/market/live/${match.id}` });
    }
    const open = await prisma.playerFeedMapping.count({
      where: {
        matchId: match.id,
        mappingStatus: { in: ["UNMAPPED", "NEEDS_REVIEW"] },
        participationStatus: { in: ["PLAYING_XI", "ACTIVE", "SUBSTITUTE"] },
      },
    });
    if (open > 0) {
      items.push({
        label: `${match.homeTeam} vs ${match.awayTeam} starts soon with unresolved player mappings`,
        href: `/admin/market/live/${match.id}`,
      });
    }
  }
  const conflicts = await prisma.consensusEvent.findMany({
    where: { confidence: "CONFLICT", createdAt: { gt: new Date(now.getTime() - 6 * 60 * 60 * 1000) } },
    take: 3,
    include: { match: { select: { homeTeam: true, awayTeam: true } } },
  });
  for (const row of conflicts) {
    items.push({ label: `Consensus conflict on ${row.match.homeTeam} vs ${row.match.awayTeam}`, href: `/admin/market/live/${row.matchId}` });
  }
  return items.slice(0, 8);
}

async function countHighValueChurn(thresholdPaise: bigint, inactiveDays: number, now: Date): Promise<number> {
  const customers = await prisma.user.findMany({
    where: { role: "CUSTOMER", trades: { some: {} } },
    select: {
      createdAt: true,
      payments: { where: { kind: "DEPOSIT", status: "SETTLED" }, select: { amountPaise: true } },
      trades: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
    },
  });
  return customers.filter((customer) => {
    const deposits = customer.payments.reduce((sum, payment) => sum + payment.amountPaise, 0n);
    return (
      isHighValue(deposits, thresholdPaise) &&
      isChurnRisk({
        accountCreatedAt: customer.createdAt,
        lastTradeAt: customer.trades[0]?.createdAt ?? null,
        now,
        inactiveDays,
      })
    );
  }).length;
}
