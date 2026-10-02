import { AnnouncementForm } from "@/components/ops-forms";
import { assertPagePermission } from "@/server/guard";
import { prisma } from "@/server/prisma";

export const metadata = { title: "Announcements" };

export default async function AnnouncementsPage() {
  await assertPagePermission("content.manage");
  const rows = await prisma.announcement.findMany({ orderBy: { updatedAt: "desc" } });
  return (
    <main>
      <h2 className="text-2xl font-bold">Announcements</h2>
      <AnnouncementForm />
      <ul className="mt-4 space-y-2 text-sm">
        {rows.map((row) => (
          <li key={row.id} className="rounded-xl border border-line bg-card px-3 py-3">
            <p className="font-semibold">{row.title}</p>
            <p className="text-xs text-muted">{row.status}</p>
            <p className="mt-1">{row.body}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
