import Link from "next/link";
import { requireCustomer } from "@/server/page-access";
import { recentEvents } from "@/server/queries";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  await requireCustomer({ type: "NOTIFICATIONS" });
  const events = await recentEvents(20);
  return (
    <main className="px-4 pt-4">
      <h1 className="text-2xl font-bold">Alerts</h1>
      <p className="mt-2 text-sm text-muted">Simulated match notes. Price changes themselves stay on the player cards.</p>
      {events.length === 0 ? <p className="mt-4 text-sm text-muted">No alerts yet. The worker adds simulated events while it is running.</p> : null}
      <ul className="mt-4 space-y-3">
        {events.map((event) => (
          <li key={event.id}>
            <Link href={`/players/${event.slug}`} className="block rounded-2xl bg-card p-3">
              <p className="text-xs text-muted">
                {event.overLabel} · {event.kind} · simulated
              </p>
              <p className="wrap-anywhere mt-1 text-sm">
                {event.playerName}: {event.summary}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
