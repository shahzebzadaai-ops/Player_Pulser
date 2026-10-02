import { PriceEventForm } from "@/components/price-event-form";
import { PERFORMANCE_RULES } from "@/domain/pricing-engine";
import { hasPermission } from "@/domain/permissions";
import { assertPagePermission } from "@/server/guard";
import { explainRecentMovement, pricingBoard } from "@/server/pricing";
import { prisma } from "@/server/prisma";

export const metadata = { title: "Price events" };

export default async function PriceEventsPage() {
  const access = await assertPagePermission("player.view");
  const [board, ticks] = await Promise.all([
    pricingBoard(),
    prisma.priceTick.findMany({
      where: { source: { in: ["admin", "performance", "demand", "news"] } },
      include: { player: true },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);
  const explanations = await Promise.all(board.players.slice(0, 8).map(async (player) => ({
    name: player.name,
    lines: await explainRecentMovement(player.id),
  })));
  return (
    <main>
      <h2 className="text-2xl font-bold">Price events</h2>
      <p className="mt-1 text-sm text-muted">
        Engine {board.engineMode}. Only verified news changes a price. A player who is not selected stays tradable. Duplicate event ids are ignored.
      </p>
      {hasPermission(access.staffRole, "player.edit") ? (
        <PriceEventForm players={board.players.map((player) => ({ id: player.id, name: player.name }))} />
      ) : null}
      <h3 className="mt-6 font-semibold">Why prices moved</h3>
      <ul className="mt-2 space-y-2 text-sm">
        {explanations.map((row) => (
          <li key={row.name} className="rounded-xl border border-line bg-card px-3 py-2">
            {row.name}: {row.lines.length === 0 ? "No structured move yet." : row.lines.join(" · ")}
          </li>
        ))}
      </ul>
      <h3 className="mt-6 font-semibold">Performance rules</h3>
      <ul className="mt-2 grid gap-1 text-xs text-muted sm:grid-cols-2">
        {Object.entries(PERFORMANCE_RULES).map(([name, rule]) => (
          <li key={name}>{name} {rule.bps > 0 ? "+" : ""}{rule.bps} bps{rule.contextApplies ? " · context applies" : ""}</li>
        ))}
      </ul>
      <h3 className="mt-6 font-semibold">Recent priced ticks</h3>
      <ul className="mt-2 space-y-2 text-sm">
        {ticks.length === 0 ? <li className="text-muted">No priced ticks yet.</li> : null}
        {ticks.map((tick) => (
          <li key={tick.id} className="rounded-xl border border-line bg-card px-3 py-2">
            {tick.player.name} · {tick.source} · {tick.eventType ?? "manual"} · {tick.midPaise.toString()} paise
            {tick.wasClamped ? ` · clamped ${tick.clampReason ?? ""}` : ""}
            <span className="block text-xs text-muted">{tick.reason ?? tick.createdAt.toISOString()}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
