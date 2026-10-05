import { TaskList } from "@/components/task-list";
import { assertPagePermission } from "@/server/guard";

export const metadata = { title: "Work queue" };

export default async function WorkQueuePage() {
  await assertPagePermission("task.manage");
  return <TaskList title="Work queue" note="Open operational tasks across customers, withdrawals, and content." />;
}
