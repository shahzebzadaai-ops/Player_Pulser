import { AppError } from "@/domain/errors";
import { gatewayChangeAllowed } from "@/domain/growth";
import { requireReason, writeAudit } from "./audit";
import { prisma } from "./prisma";

export async function saveGateway(input: {
  actorId: string;
  permission: boolean;
  reason: string;
  ip?: string | null;
  id?: string;
  category: "BANKING" | "CRYPTO";
  name: string;
  providerKey: string;
  enabled: boolean;
  environment: string;
  priority: number;
  supportedMethods: string[];
  asset?: string | null;
  network?: string | null;
  depositEnabled: boolean;
  withdrawalEnabled: boolean;
  minimumDepositPaise?: bigint | null;
  maximumDepositPaise?: bigint | null;
  minimumWithdrawalPaise?: bigint | null;
  maximumWithdrawalPaise?: bigint | null;
  confirmationsRequired?: number | null;
  configRef?: string | null;
  notes?: string | null;
}) {
  if (!gatewayChangeAllowed({ permission: input.permission, reason: input.reason })) {
    throw new AppError("FORBIDDEN", "A permission and a reason are required.", 403);
  }
  const reason = requireReason(input.reason);
  const data = {
    category: input.category,
    name: input.name.trim(),
    providerKey: input.providerKey.trim(),
    enabled: input.enabled,
    environment: input.environment,
    priority: input.priority,
    supportedMethods: input.supportedMethods,
    asset: input.asset ?? null,
    network: input.network ?? null,
    depositEnabled: input.depositEnabled,
    withdrawalEnabled: input.withdrawalEnabled,
    minimumDepositPaise: input.minimumDepositPaise ?? null,
    maximumDepositPaise: input.maximumDepositPaise ?? null,
    minimumWithdrawalPaise: input.minimumWithdrawalPaise ?? null,
    maximumWithdrawalPaise: input.maximumWithdrawalPaise ?? null,
    confirmationsRequired: input.confirmationsRequired ?? null,
    configRef: input.configRef?.trim() || null,
    notes: input.notes?.trim() || null,
  };
  const before = input.id ? await prisma.paymentGateway.findUnique({ where: { id: input.id } }) : null;
  const saved = input.id
    ? await prisma.paymentGateway.update({ where: { id: input.id }, data })
    : await prisma.paymentGateway.create({ data });
  await writeAudit({
    actorId: input.actorId,
    action: input.enabled ? "gateway.enable" : "gateway.disable",
    entityType: "PaymentGateway",
    entityId: saved.id,
    before,
    after: { enabled: saved.enabled, priority: saved.priority, providerKey: saved.providerKey },
    reason,
    ip: input.ip,
  });
  return saved;
}

export function gatewayHealthLabel(providerKey: string): { configured: boolean; health: string; detail: string } {
  if (providerKey === "simulated") {
    return { configured: true, health: "OK", detail: "The local simulator is configured. No live credential is stored." };
  }
  const envName = `PAYMENT_${providerKey.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_SECRET`;
  const configured = Boolean(process.env[envName]);
  if (!configured) return { configured: false, health: "NOT_CONFIGURED", detail: "Provider credential is not set in environment config." };
  return { configured: true, health: "UNKNOWN", detail: "A credential is present in environment config. The value is not shown." };
}
