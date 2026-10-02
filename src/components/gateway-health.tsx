export function GatewayHealthList({
  rows,
}: {
  rows: {
    id: string;
    name: string;
    configured: boolean;
    enabled: boolean;
    environment: string;
    health: string;
    lastSuccessAt: string | null;
    lastWebhookAt: string | null;
    errorCount: number;
    lastError: string | null;
  }[];
}) {
  if (rows.length === 0) return <p className="mt-4 text-sm text-muted">No providers yet.</p>;
  return (
    <ul className="mt-4 space-y-2 text-sm">
      {rows.map((row) => (
        <li key={row.id} className="rounded-xl border border-line bg-card px-3 py-3">
          <p className="font-semibold">{row.name}</p>
          <p>{row.configured ? "configured" : "not configured"} · {row.enabled ? "enabled" : "disabled"} · {row.environment}</p>
          <p>Health: {row.health}</p>
          <p>Last successful call: {row.lastSuccessAt ?? "none"}</p>
          <p>Last webhook: {row.lastWebhookAt ?? "none"}</p>
          <p>Error count: {row.errorCount}</p>
          <p>Recent error: {row.lastError ?? "none"}</p>
        </li>
      ))}
    </ul>
  );
}
