import { SegmentCreate, SegmentMember } from "@/components/ops-forms";
import { assertPagePermission } from "@/server/guard";
import { prisma } from "@/server/prisma";

export const metadata = { title: "Segments" };

export default async function SegmentsPage() {
  await assertPagePermission("crm.view");
  const [segments, users] = await Promise.all([
    prisma.segment.findMany({ include: { members: { include: { user: true } } }, orderBy: { createdAt: "desc" } }),
    prisma.user.findMany({ where: { role: "CUSTOMER" }, select: { id: true, displayName: true } }),
  ]);
  return (
    <main>
      <h2 className="text-2xl font-bold">Segments</h2>
      <p className="mt-1 text-sm text-muted">Named customer groups for follow-up. Membership does not change offers by itself.</p>
      <SegmentCreate />
      <ul className="mt-4 space-y-3">
        {segments.length === 0 ? <li className="text-sm text-muted">No segments yet.</li> : null}
        {segments.map((segment) => (
          <li key={segment.id} className="rounded-2xl border border-line bg-card p-3">
            <p className="font-semibold">{segment.name}</p>
            <p className="text-sm text-muted">{segment.description}</p>
            <p className="mt-2 text-sm">{segment.members.map((member) => member.user.displayName).join(", ") || "No members"}</p>
            <SegmentMember segmentId={segment.id} users={users} />
          </li>
        ))}
      </ul>
    </main>
  );
}
