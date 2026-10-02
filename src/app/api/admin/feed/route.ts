import { z } from "zod";
import type { MatchStatus } from "@/domain/cricket-feed";
import type { Permission } from "@/domain/permissions";
import { AppError } from "@/domain/errors";
import { requirePermission } from "@/server/access";
import { clientIp, requireReason, writeAudit } from "@/server/audit";
import { SHADOW_VALIDATION_PERMISSION } from "@/domain/shadow-validation";
import {
  acknowledgeCorrection,
  createCricketMatch,
  failoverTo,
  importDiscoveredMatch,
  mapFeedPlayer,
  markShadowValidated,
  restartFeedSource,
  setMatchStatus,
  setSourceEnabled,
  setSourceOperatingMode,
  setSourcePriority,
} from "@/server/feed";
import { confirmSafePlayerMappings, prepareShadowMatch, refreshIndiaDiscoveries } from "@/server/match-prepare";
import { assertSameOrigin, handle, json, readBody } from "@/server/http";

const schema = z.object({
  action: z.enum(["create_match", "set_status", "map_player", "enable_source", "set_priority", "failover", "restart_source", "import_discovered", "set_source_mode", "acknowledge_correction", "mark_shadow_validated", "refresh_india_matches", "prepare_shadow_match", "confirm_safe_mappings"]),
  reason: z.string().optional(),
  matchId: z.string().optional(),
  competition: z.string().optional(),
  homeTeam: z.string().optional(),
  awayTeam: z.string().optional(),
  venue: z.string().optional(),
  scheduledAt: z.string().optional(),
  source: z.string().optional(),
  externalId: z.string().optional(),
  status: z.string().optional(),
  externalPlayerId: z.string().optional(),
  externalPlayerName: z.string().optional(),
  internalPlayerId: z.string().optional(),
  participationStatus: z.string().optional(),
  enabled: z.boolean().optional(),
  priority: z.number().optional(),
  discoveredId: z.string().optional(),
  mode: z.string().optional(),
  confirmSwitch: z.boolean().optional(),
  eventId: z.string().optional(),
  candidate: z.string().max(20000).optional(),
});

const PERMISSION: Record<z.infer<typeof schema>["action"], Permission> = {
  create_match: "feed.manage",
  set_status: "feed.manage",
  failover: "feed.manage",
  map_player: "feed.mapping_manage",
  enable_source: "feed.source_manage",
  set_priority: "feed.source_manage",
  restart_source: "feed.source_manage",
  import_discovered: "feed.manage",
  set_source_mode: "feed.source_manage",
  acknowledge_correction: "feed.manage",
  mark_shadow_validated: SHADOW_VALIDATION_PERMISSION,
  refresh_india_matches: "feed.manage",
  prepare_shadow_match: "feed.manage",
  confirm_safe_mappings: "feed.mapping_manage",
};

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const body = await readBody(request, schema);
    const { user } = await requirePermission(request, PERMISSION[body.action]);
    const reason = requireReason(body.reason);
    const ip = clientIp(request);
    if (body.action === "create_match") {
      if (!body.competition || !body.homeTeam || !body.awayTeam || !body.scheduledAt || !body.source || !body.externalId) {
        throw new AppError("INVALID", "Enter the match, source, and external id.", 400);
      }
      const scheduledAt = new Date(body.scheduledAt);
      if (Number.isNaN(scheduledAt.getTime())) throw new AppError("INVALID", "Enter a valid start time.", 400);
      const match = await createCricketMatch({
        competition: body.competition,
        homeTeam: body.homeTeam,
        awayTeam: body.awayTeam,
        venue: body.venue ?? "",
        scheduledAt,
        source: body.source,
        externalId: body.externalId,
      });
      await writeAudit({ actorId: user.id, action: "feed.match_create", entityType: "CricketMatch", entityId: match.id, after: { status: "SCHEDULED" }, reason, ip });
      return json({ ok: true, matchId: match.id });
    }
    if (body.action === "set_status") {
      if (!body.matchId || !body.status) throw new AppError("INVALID", "Choose a match status.", 400);
      const before = await setMatchStatus(body.matchId, body.status as MatchStatus);
      await writeAudit({
        actorId: user.id,
        action: "feed.match_status",
        entityType: "CricketMatch",
        entityId: body.matchId,
        before: { status: before },
        after: { status: body.status },
        reason,
        ip,
      });
      return json({ ok: true });
    }
    if (body.action === "map_player") {
      if (!body.matchId || !body.source || !body.externalPlayerId || !body.externalPlayerName || !body.internalPlayerId) {
        throw new AppError("INVALID", "Choose the feed player and the PlayerPulser player.", 400);
      }
      await mapFeedPlayer({
        matchId: body.matchId,
        source: body.source,
        externalPlayerId: body.externalPlayerId,
        externalPlayerName: body.externalPlayerName,
        internalPlayerId: body.internalPlayerId,
        participationStatus: body.participationStatus,
      });
      await writeAudit({
        actorId: user.id,
        action: "feed.mapping",
        entityType: "PlayerFeedMapping",
        entityId: body.externalPlayerId,
        after: { source: body.source, internalPlayerId: body.internalPlayerId, matchId: body.matchId },
        reason,
        ip,
      });
      return json({ ok: true });
    }
    if (body.action === "refresh_india_matches") {
      const availability = await refreshIndiaDiscoveries();
      return json({ ok: true, availability });
    }
    if (body.action === "prepare_shadow_match") {
      if (!body.candidate) throw new AppError("INVALID", "Choose a resolved India match.", 400);
      let match: Parameters<typeof prepareShadowMatch>[0]["match"];
      try {
        match = JSON.parse(body.candidate) as Parameters<typeof prepareShadowMatch>[0]["match"];
      } catch {
        throw new AppError("INVALID", "That match candidate could not be read.", 400);
      }
      const prepared = await prepareShadowMatch({ match, actorId: user.id, reason, ip });
      return json({ ok: true, matchId: prepared.matchId });
    }
    if (body.action === "confirm_safe_mappings") {
      if (!body.matchId) throw new AppError("INVALID", "Choose a match.", 400);
      const confirmed = await confirmSafePlayerMappings({ matchId: body.matchId, actorId: user.id, reason, ip });
      return json({ ok: true, confirmed: confirmed.confirmed });
    }
    if (body.action === "import_discovered") {
      if (!body.discoveredId) throw new AppError("INVALID", "Choose a discovered match.", 400);
      const imported = await importDiscoveredMatch({ discoveredId: body.discoveredId, actorId: user.id, reason, ip });
      return json({ ok: true, matchId: imported.matchId });
    }
    if (body.action === "acknowledge_correction") {
      if (!body.eventId) throw new AppError("INVALID", "Choose a corrected event.", 400);
      await acknowledgeCorrection({ eventId: body.eventId, actorId: user.id, reason, ip });
      return json({ ok: true });
    }
    if (body.action === "mark_shadow_validated") {
      if (!body.matchId) throw new AppError("INVALID", "Choose a match.", 400);
      await markShadowValidated({ matchId: body.matchId, actorId: user.id, reason, ip });
      return json({ ok: true });
    }
    if (body.action === "set_source_mode") {
      if (!body.source || !body.mode) throw new AppError("INVALID", "Choose a source and a mode.", 400);
      await setSourceOperatingMode({
        source: body.source,
        mode: body.mode,
        confirmSwitch: Boolean(body.confirmSwitch),
        actorId: user.id,
        reason,
        ip,
      });
      return json({ ok: true });
    }
    if (!body.source) throw new AppError("INVALID", "Choose a source.", 400);
    if (body.action === "enable_source") {
      await setSourceEnabled(body.source, Boolean(body.enabled));
      await writeAudit({
        actorId: user.id,
        action: body.enabled ? "feed.source_enabled" : "feed.source_disabled",
        entityType: "FeedSourceState",
        entityId: body.source,
        after: { enabled: Boolean(body.enabled) },
        reason,
        ip,
      });
      return json({ ok: true });
    }
    if (body.action === "set_priority") {
      await setSourcePriority(body.source, body.priority ?? 0);
      await writeAudit({
        actorId: user.id,
        action: "feed.source_priority",
        entityType: "FeedSourceState",
        entityId: body.source,
        after: { priority: body.priority },
        reason,
        ip,
      });
      return json({ ok: true });
    }
    if (body.action === "failover") {
      await failoverTo(body.source, reason);
      await writeAudit({
        actorId: user.id,
        action: "feed.failover",
        entityType: "FeedControl",
        entityId: body.source,
        after: { activeSource: body.source },
        reason,
        ip,
      });
      return json({ ok: true });
    }
    await restartFeedSource(body.source);
    await writeAudit({
      actorId: user.id,
      action: "feed.restart",
      entityType: "FeedSourceState",
      entityId: body.source,
      after: { consecutiveFailures: 0 },
      reason,
      ip,
    });
    return json({ ok: true });
  });
}
