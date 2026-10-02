import { z } from "zod";
import { requirePermission } from "@/server/access";
import { clientIp } from "@/server/audit";
import { saveGateway } from "@/server/gateways";
import { assertSameOrigin, handle, json, readBody } from "@/server/http";

const schema = z.object({
  id: z.string().optional(),
  category: z.enum(["BANKING", "CRYPTO"]),
  name: z.string().min(2).max(80),
  providerKey: z.string().min(2).max(40),
  enabled: z.boolean(),
  environment: z.enum(["sandbox", "live"]),
  priority: z.number().int().min(1).max(999),
  supportedMethods: z.array(z.string().min(1).max(40)).max(12),
  asset: z.string().max(20).optional(),
  network: z.string().max(40).optional(),
  depositEnabled: z.boolean(),
  withdrawalEnabled: z.boolean(),
  minimumDepositPaise: z.string().regex(/^\d+$/).optional(),
  maximumDepositPaise: z.string().regex(/^\d+$/).optional(),
  minimumWithdrawalPaise: z.string().regex(/^\d+$/).optional(),
  maximumWithdrawalPaise: z.string().regex(/^\d+$/).optional(),
  confirmationsRequired: z.number().int().min(0).max(100).optional(),
  configRef: z.string().max(120).optional(),
  notes: z.string().max(500).optional(),
  reason: z.string(),
});

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const { user } = await requirePermission(request, "settings.manage");
    const body = await readBody(request, schema);
    const saved = await saveGateway({
      actorId: user.id,
      permission: true,
      reason: body.reason,
      ip: clientIp(request),
      id: body.id,
      category: body.category,
      name: body.name,
      providerKey: body.providerKey,
      enabled: body.enabled,
      environment: body.environment,
      priority: body.priority,
      supportedMethods: body.supportedMethods,
      asset: body.asset,
      network: body.network,
      depositEnabled: body.depositEnabled,
      withdrawalEnabled: body.withdrawalEnabled,
      minimumDepositPaise: body.minimumDepositPaise ? BigInt(body.minimumDepositPaise) : null,
      maximumDepositPaise: body.maximumDepositPaise ? BigInt(body.maximumDepositPaise) : null,
      minimumWithdrawalPaise: body.minimumWithdrawalPaise ? BigInt(body.minimumWithdrawalPaise) : null,
      maximumWithdrawalPaise: body.maximumWithdrawalPaise ? BigInt(body.maximumWithdrawalPaise) : null,
      confirmationsRequired: body.confirmationsRequired,
      configRef: body.configRef,
      notes: body.notes,
    });
    return json({ id: saved.id, enabled: saved.enabled });
  });
}
