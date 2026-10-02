import { requirePermission } from "@/server/access";
import { audienceRows, isAudiencePreset } from "@/server/audience";
import { clientIp, writeAudit } from "@/server/audit";
import { assertSameOrigin, handle } from "@/server/http";

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const { user } = await requirePermission(request, "audience.export");
    const body = (await request.json().catch(() => ({}))) as { preset?: string };
    const preset = isAudiencePreset(body.preset) ? body.preset : "all";
    const customers = await audienceRows(preset);
    await writeAudit({
      actorId: user.id,
      action: "audience.export",
      entityType: "User",
      after: { rows: customers.length, preset },
      ip: clientIp(request),
    });
    const lines = ["id,displayName,phone,email,createdAt"];
    for (const customer of customers) {
      lines.push(
        [customer.id, customer.displayName, customer.phone ?? "", customer.email ?? "", customer.createdAt.toISOString()]
          .map(csvCell)
          .join(","),
      );
    }
    return new Response(lines.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=playerpulser-audience.csv",
        "Cache-Control": "private, no-store",
      },
    });
  });
}
