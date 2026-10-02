import { TaskCreate, TaskStatus } from "@/components/ops-forms";
import { prisma } from "@/server/prisma";

const TYPES = ["VIP_CALL", "WITHDRAWAL_REVIEW", "CUSTOMER_SUPPORT", "CONTENT_UPDATE", "CRM_FOLLOWUP"] as const;

export async function TaskList({ type, title, note }: { type?: (typeof TYPES)[number] | (typeof TYPES)[number][]; title: string; note: string }) {
  const types = type ? (Array.isArray(type) ? type : [type]) : [...TYPES];
  const [tasks, staff, customers] = await Promise.all([
    prisma.staffTask.findMany({ where: { type: { in: types } }, orderBy: { createdAt: "desc" }, take: 80 }),
    prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true, displayName: true } }),
    prisma.user.findMany({ where: { role: "CUSTOMER" }, select: { id: true, displayName: true }, orderBy: { displayName: "asc" } }),
  ]);
  const names = new Map([...staff, ...customers].map((person) => [person.id, person.displayName]));
  return (
    <main>
      <h2 className="text-2xl font-bold">{title}</h2>
      <p className="mt-1 text-sm text-muted">{note}</p>
      <TaskCreate staff={staff} customers={customers} />
      <ul className="mt-4 space-y-2 text-sm">
        {tasks.length === 0 ? <li className="text-muted">No tasks yet.</li> : null}
        {tasks.map((task) => (
          <li key={task.id} className="rounded-xl border border-line bg-card px-3 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">{task.title}</p>
              <TaskStatus id={task.id} status={task.status} />
            </div>
            <p className="mt-1 text-xs text-muted">
              {task.type} · {task.priority}
              {task.customerId ? ` · ${names.get(task.customerId) ?? "customer"}` : ""}
              {task.assignedToId ? ` · ${names.get(task.assignedToId) ?? "staff"}` : ""}
              {task.dueAt ? ` · due ${task.dueAt.toISOString()}` : ""}
            </p>
            {task.notes ? <p className="mt-1">{task.notes}</p> : null}
          </li>
        ))}
      </ul>
    </main>
  );
}
