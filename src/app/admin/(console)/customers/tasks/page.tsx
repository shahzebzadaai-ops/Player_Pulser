import { TaskList } from "@/components/task-list";
import { assertPagePermission } from "@/server/guard";

export const metadata = { title: "Call tasks" };

export default async function CallTasksPage() {
  await assertPagePermission("task.manage");
  return <TaskList type={["VIP_CALL", "CUSTOMER_SUPPORT", "CRM_FOLLOWUP"]} title="Call tasks" note="VIP calls, support, and CRM follow-ups." />;
}
