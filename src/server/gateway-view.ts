import { gatewayHealthLabel } from "./gateways";

export function presentGateway(row: {
  id: string;
  name: string;
  providerKey: string;
  enabled: boolean;
  environment: string;
  priority: number;
  supportedMethods: unknown;
  asset: string | null;
  network: string | null;
  depositEnabled: boolean;
  withdrawalEnabled: boolean;
  minimumDepositPaise: bigint | null;
  maximumDepositPaise: bigint | null;
  minimumWithdrawalPaise: bigint | null;
  maximumWithdrawalPaise: bigint | null;
  confirmationsRequired: number | null;
  configRef: string | null;
  health: string;
  lastSuccessAt: Date | null;
  lastWebhookAt: Date | null;
  errorCount: number;
  successCount: number;
  lastError: string | null;
  notes: string | null;
}) {
  const health = gatewayHealthLabel(row.providerKey);
  const methods = Array.isArray(row.supportedMethods) ? row.supportedMethods.filter((item): item is string => typeof item === "string") : [];
  return {
    id: row.id,
    name: row.name,
    providerKey: row.providerKey,
    enabled: row.enabled,
    environment: row.environment,
    priority: row.priority,
    supportedMethods: methods,
    asset: row.asset,
    network: row.network,
    depositEnabled: row.depositEnabled,
    withdrawalEnabled: row.withdrawalEnabled,
    minimumDepositPaise: row.minimumDepositPaise?.toString() ?? null,
    maximumDepositPaise: row.maximumDepositPaise?.toString() ?? null,
    minimumWithdrawalPaise: row.minimumWithdrawalPaise?.toString() ?? null,
    maximumWithdrawalPaise: row.maximumWithdrawalPaise?.toString() ?? null,
    confirmationsRequired: row.confirmationsRequired,
    configRef: row.configRef,
    configured: health.configured,
    health: row.health === "UNKNOWN" ? health.health : row.health,
    lastSuccessAt: row.lastSuccessAt?.toISOString() ?? null,
    lastWebhookAt: row.lastWebhookAt?.toISOString() ?? null,
    errorCount: row.errorCount,
    successCount: row.successCount,
    lastError: row.lastError,
    notes: row.notes,
  };
}
