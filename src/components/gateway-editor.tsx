"use client";

import { useState } from "react";

type GatewayRow = {
  id: string;
  name: string;
  providerKey: string;
  enabled: boolean;
  environment: string;
  priority: number;
  supportedMethods: string[];
  asset: string | null;
  network: string | null;
  depositEnabled: boolean;
  withdrawalEnabled: boolean;
  minimumDepositPaise: string | null;
  maximumDepositPaise: string | null;
  minimumWithdrawalPaise: string | null;
  maximumWithdrawalPaise: string | null;
  confirmationsRequired: number | null;
  configRef: string | null;
  health: string;
  lastSuccessAt: string | null;
  lastWebhookAt: string | null;
  errorCount: number;
  successCount: number;
  lastError: string | null;
  configured: boolean;
  notes: string | null;
};

export function GatewayEditor({ category, rows }: { category: "BANKING" | "CRYPTO"; rows: GatewayRow[] }) {
  const [message, setMessage] = useState<string | null>(null);

  async function save(form: FormData, id?: string) {
    const methods = String(form.get("methods") ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const response = await fetch("/api/admin/gateways", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id,
        category,
        name: String(form.get("name") ?? ""),
        providerKey: String(form.get("providerKey") ?? ""),
        enabled: form.get("enabled") === "on",
        environment: String(form.get("environment") ?? "sandbox"),
        priority: Number(form.get("priority") ?? 100),
        supportedMethods: methods,
        asset: String(form.get("asset") ?? "") || undefined,
        network: String(form.get("network") ?? "") || undefined,
        depositEnabled: form.get("depositEnabled") === "on",
        withdrawalEnabled: form.get("withdrawalEnabled") === "on",
        minimumDepositPaise: String(form.get("minimumDepositPaise") ?? "") || undefined,
        maximumDepositPaise: String(form.get("maximumDepositPaise") ?? "") || undefined,
        minimumWithdrawalPaise: String(form.get("minimumWithdrawalPaise") ?? "") || undefined,
        maximumWithdrawalPaise: String(form.get("maximumWithdrawalPaise") ?? "") || undefined,
        confirmationsRequired: form.get("confirmationsRequired") ? Number(form.get("confirmationsRequired")) : undefined,
        configRef: String(form.get("configRef") ?? "") || undefined,
        notes: String(form.get("notes") ?? "") || undefined,
        reason: String(form.get("reason") ?? ""),
      }),
    });
    const body = (await response.json()) as { error?: { message: string } };
    setMessage(response.ok ? "Saved." : body.error?.message ?? "Not saved.");
    if (response.ok) window.location.reload();
  }

  return (
    <div className="mt-4 space-y-4">
      {rows.map((row) => (
        <form key={row.id} action={(form) => save(form, row.id)} className="rounded-2xl border border-line bg-card p-4 text-sm">
          <p className="font-semibold">{row.name}</p>
          <p className="text-xs text-muted">
            {row.providerKey} · {row.enabled ? "enabled" : "disabled"} · priority {row.priority} · {row.health}
          </p>
          <p className="mt-1 text-xs text-muted">
            {row.configured ? "configured" : "not configured"} · last success {row.lastSuccessAt ?? "none"} · last webhook {row.lastWebhookAt ?? "none"} · errors {row.errorCount} · {row.lastError ?? "no recent error"}
          </p>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <input name="name" defaultValue={row.name} className="min-h-10 rounded-xl border border-line bg-pitch px-2" />
            <input name="providerKey" defaultValue={row.providerKey} className="min-h-10 rounded-xl border border-line bg-pitch px-2" />
            <input name="priority" type="number" defaultValue={row.priority} className="min-h-10 rounded-xl border border-line bg-pitch px-2" />
            <select name="environment" defaultValue={row.environment} className="min-h-10 rounded-xl border border-line bg-pitch px-2">
              <option value="sandbox">sandbox</option>
              <option value="live">live</option>
            </select>
            <input name="methods" defaultValue={row.supportedMethods.join(", ")} className="min-h-10 rounded-xl border border-line bg-pitch px-2" />
            {category === "CRYPTO" ? (
              <>
                <input name="asset" defaultValue={row.asset ?? ""} placeholder="Asset" className="min-h-10 rounded-xl border border-line bg-pitch px-2" />
                <input name="network" defaultValue={row.network ?? ""} placeholder="Network" className="min-h-10 rounded-xl border border-line bg-pitch px-2" />
                <input name="confirmationsRequired" type="number" defaultValue={row.confirmationsRequired ?? 1} className="min-h-10 rounded-xl border border-line bg-pitch px-2" />
              </>
            ) : null}
            <input name="minimumDepositPaise" defaultValue={row.minimumDepositPaise ?? ""} placeholder="Min deposit paise" className="min-h-10 rounded-xl border border-line bg-pitch px-2" />
            <input name="maximumDepositPaise" defaultValue={row.maximumDepositPaise ?? ""} placeholder="Max deposit paise" className="min-h-10 rounded-xl border border-line bg-pitch px-2" />
            <input name="minimumWithdrawalPaise" defaultValue={row.minimumWithdrawalPaise ?? ""} placeholder="Min withdrawal paise" className="min-h-10 rounded-xl border border-line bg-pitch px-2" />
            <input name="maximumWithdrawalPaise" defaultValue={row.maximumWithdrawalPaise ?? ""} placeholder="Max withdrawal paise" className="min-h-10 rounded-xl border border-line bg-pitch px-2" />
            <input name="configRef" defaultValue={row.configRef ?? ""} placeholder="Config reference, not a secret" className="min-h-10 rounded-xl border border-line bg-pitch px-2" />
            <input name="notes" defaultValue={row.notes ?? ""} className="min-h-10 rounded-xl border border-line bg-pitch px-2" />
            <input name="reason" placeholder="Reason" className="min-h-10 rounded-xl border border-line bg-pitch px-2" required />
          </div>
          <label className="mt-2 flex items-center gap-2"><input type="checkbox" name="enabled" defaultChecked={row.enabled} /> Enabled</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="depositEnabled" defaultChecked={row.depositEnabled} /> Deposit enabled</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="withdrawalEnabled" defaultChecked={row.withdrawalEnabled} /> Withdrawal enabled</label>
          <button className="mt-3 min-h-10 rounded-full bg-india px-4" type="submit">Save</button>
        </form>
      ))}
      <form action={(form) => save(form)} className="rounded-2xl border border-dashed border-line p-4 text-sm">
        <p className="font-semibold">Add provider</p>
        <p className="mt-1 text-xs text-muted">Secrets stay in environment config. This form stores a config reference only.</p>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <input name="name" placeholder="Name" required className="min-h-10 rounded-xl border border-line bg-pitch px-2" />
          <input name="providerKey" placeholder="providerKey" required className="min-h-10 rounded-xl border border-line bg-pitch px-2" />
          <input name="priority" type="number" defaultValue={100} className="min-h-10 rounded-xl border border-line bg-pitch px-2" />
          <select name="environment" defaultValue="sandbox" className="min-h-10 rounded-xl border border-line bg-pitch px-2">
            <option value="sandbox">sandbox</option>
            <option value="live">live</option>
          </select>
          <input name="methods" placeholder="UPI, Bank Transfer" className="min-h-10 rounded-xl border border-line bg-pitch px-2" />
          {category === "CRYPTO" ? (
            <>
              <input name="asset" placeholder="USDT" className="min-h-10 rounded-xl border border-line bg-pitch px-2" />
              <input name="network" placeholder="TRC20" className="min-h-10 rounded-xl border border-line bg-pitch px-2" />
              <input name="confirmationsRequired" type="number" defaultValue={1} className="min-h-10 rounded-xl border border-line bg-pitch px-2" />
            </>
          ) : null}
          <input name="configRef" placeholder="env:PROVIDER_CONFIG" className="min-h-10 rounded-xl border border-line bg-pitch px-2" />
          <input name="notes" placeholder="Notes" className="min-h-10 rounded-xl border border-line bg-pitch px-2" />
          <input name="reason" placeholder="Reason" required className="min-h-10 rounded-xl border border-line bg-pitch px-2" />
        </div>
        <label className="mt-2 flex items-center gap-2"><input type="checkbox" name="depositEnabled" /> Deposit enabled</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="withdrawalEnabled" /> Withdrawal enabled</label>
        <button className="mt-3 min-h-10 rounded-full bg-india px-4" type="submit">Add</button>
      </form>
      {message ? <p className="text-sm">{message}</p> : null}
    </div>
  );
}
