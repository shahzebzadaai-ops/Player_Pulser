import { z } from "zod";
import type { ManualRiskMode } from "@/domain/risk";
import type { Permission } from "@/domain/permissions";
import { requirePermission } from "@/server/access";
import { clientIp, requireReason, writeAudit } from "@/server/audit";
import { assertSameOrigin, handle, json, readBody } from "@/server/http";
import { setPlayerRiskMode } from "@/server/risk";

const schema = z.object({
  playerId: z.string(),
  action: z.enum(["pause_buys", "resume_buys", "pause_all", "resume_all"]),
  reason: z.string().optional(),
});

const ACTIONS: Record<z.infer<typeof schema>["action"], { mode: ManualRiskMode; permission: Permission; audit: string }> = {
  pause_buys: { mode: "PAUSE_BUYS", permission: "risk.manage", audit: "risk.pause_buys" },
  resume_buys: { mode: "AUTO", permission: "risk.manage", audit: "risk.resume_buys" },
  pause_all: { mode: "PAUSE_ALL", permission: "risk.pause", audit: "risk.pause_all" },
  resume_all: { mode: "AUTO", permission: "risk.pause", audit: "risk.resume_all" },
};

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const body = await readBody(request, schema);
    const action = ACTIONS[body.action];
    const { user } = await requirePermission(request, action.permission);
    const reason = requireReason(body.reason);
    await setPlayerRiskMode({ playerId: body.playerId, mode: action.mode, actorId: user.id, reason });
    await writeAudit({
      actorId: user.id,
      action: action.audit,
      entityType: "PlayerRiskControl",
      entityId: body.playerId,
      after: { manualMode: action.mode },
      reason,
      ip: clientIp(request),
    });
    return json({ ok: true });
  });
}
