"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FEATURE_KEYS, FEATURE_LABELS, isHighImpactFeature, type FeatureFlags, type FeatureKey } from "@/domain/features";
import type { SeoSettings } from "@/domain/seo";
import { STAFF_ROLES } from "@/domain/permissions";

const field = "mt-1 min-h-11 w-full rounded-xl border border-line bg-pitch px-3";

async function send(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as { error?: { message: string }; id?: string };
  if (!response.ok) throw new Error(payload.error?.message ?? "Not saved.");
  return payload;
}

export function FeatureToggles({ flags }: { flags: FeatureFlags }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<FeatureKey | null>(null);
  const [reason, setReason] = useState("");

  async function save(key: FeatureKey, enabled: boolean, givenReason?: string) {
    await send("/api/admin/features", { key, enabled, reason: givenReason ?? "" });
    setMessage(`${FEATURE_LABELS[key].label} is now ${enabled ? "on" : "off"}. Existing records stay.`);
    setPending(null);
    setReason("");
    router.refresh();
  }

  return (
    <ul className="mt-4 space-y-3">
      {FEATURE_KEYS.map((key) => (
        <li key={key} className="rounded-2xl border border-line bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold">{FEATURE_LABELS[key].label}</p>
              <p className="mt-1 text-sm">Current state: {flags[key] ? "On" : "Off"}</p>
              <p className="mt-1 text-sm text-muted">{FEATURE_LABELS[key].note}</p>
            </div>
            <button
              type="button"
              className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold ${flags[key] ? "bg-india" : "bg-card-2"}`}
              onClick={() => {
                if (isHighImpactFeature(key)) {
                  setPending(key);
                  setReason("");
                  return;
                }
                void save(key, !flags[key]).catch((error: unknown) => {
                  setMessage(error instanceof Error ? error.message : "Not saved.");
                });
              }}
            >
              {flags[key] ? "On" : "Off"}
            </button>
          </div>
          {pending === key ? (
            <form
              className="mt-3 space-y-2"
              onSubmit={(event) => {
                event.preventDefault();
                void save(key, !flags[key], reason).catch((error: unknown) => {
                  setMessage(error instanceof Error ? error.message : "Not saved.");
                });
              }}
            >
              <p className="text-sm">Confirm {flags[key] ? "turning this off" : "turning this on"}. A reason is stored in the audit log.</p>
              <input className={field} value={reason} onChange={(event) => setReason(event.target.value)} required minLength={3} placeholder="Reason" />
              <div className="flex gap-2">
                <button className="min-h-11 rounded-full bg-india px-4 text-sm" type="submit">Confirm</button>
                <button className="min-h-11 rounded-full bg-card-2 px-4 text-sm" type="button" onClick={() => setPending(null)}>Cancel</button>
              </div>
            </form>
          ) : null}
        </li>
      ))}
      {message ? <li className="text-sm">{message}</li> : null}
    </ul>
  );
}

export function SeoForm({ seo }: { seo: SeoSettings }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <form
      className="mt-4 max-w-xl space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        try {
          await send("/api/admin/seo", {
            siteTitle: form.get("siteTitle"),
            siteDescription: form.get("siteDescription"),
            canonicalDomain: form.get("canonicalDomain"),
            defaultOgImageId: form.get("defaultOgImageId"),
            robotsIndex: form.get("robotsIndex") === "on",
            robotsFollow: form.get("robotsFollow") === "on",
          });
          setMessage("Saved.");
          router.refresh();
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Not saved.");
        }
      }}
    >
      <label className="block text-sm">Site title<input name="siteTitle" defaultValue={seo.siteTitle} className={field} required /></label>
      <label className="block text-sm">Site description<textarea name="siteDescription" defaultValue={seo.siteDescription} className={`${field} min-h-24 py-2`} required /></label>
      <label className="block text-sm">Canonical domain<input name="canonicalDomain" defaultValue={seo.canonicalDomain} className={field} placeholder="https://playerpulser.com" /></label>
      <label className="block text-sm">Default share image id<input name="defaultOgImageId" defaultValue={seo.defaultOgImageId} className={field} placeholder="Media library id" /></label>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input name="robotsIndex" type="checkbox" defaultChecked={seo.robotsIndex} /> Allow indexing on public pages</label>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input name="robotsFollow" type="checkbox" defaultChecked={seo.robotsFollow} /> Allow following links on public pages</label>
      <button className="min-h-11 rounded-full bg-india px-4 text-sm font-semibold" type="submit">Save SEO</button>
      {message ? <p className="text-sm">{message}</p> : null}
    </form>
  );
}

export function TaskCreate({ staff, customers }: { staff: { id: string; displayName: string }[]; customers: { id: string; displayName: string }[] }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <form
      className="mt-4 grid gap-3 md:grid-cols-2"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        try {
          await send("/api/admin/tasks", {
            action: "create",
            title: form.get("title"),
            type: form.get("type"),
            customerId: form.get("customerId") || null,
            assignedToId: form.get("assignedToId") || null,
            priority: form.get("priority"),
            dueAt: form.get("dueAt") || null,
            notes: form.get("notes") || "",
          });
          setMessage("Task opened.");
          router.refresh();
          event.currentTarget.reset();
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Not saved.");
        }
      }}
    >
      <label className="text-sm">Title<input name="title" required className={field} /></label>
      <label className="text-sm">
        Type
        <select name="type" className={field}>
          {["VIP_CALL", "WITHDRAWAL_REVIEW", "CUSTOMER_SUPPORT", "CONTENT_UPDATE", "CRM_FOLLOWUP"].map((type) => (
            <option key={type}>{type}</option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        Customer
        <select name="customerId" className={field}>
          <option value="">None</option>
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>{customer.displayName}</option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        Assign to
        <select name="assignedToId" className={field}>
          <option value="">Unassigned</option>
          {staff.map((person) => (
            <option key={person.id} value={person.id}>{person.displayName}</option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        Priority
        <select name="priority" className={field} defaultValue="NORMAL">
          {["LOW", "NORMAL", "HIGH", "URGENT"].map((priority) => (
            <option key={priority}>{priority}</option>
          ))}
        </select>
      </label>
      <label className="text-sm">Due<input name="dueAt" type="datetime-local" className={field} /></label>
      <label className="text-sm md:col-span-2">Notes<textarea name="notes" className={`${field} min-h-20 py-2`} /></label>
      <button className="min-h-11 rounded-full bg-india px-4 text-sm font-semibold md:col-span-2" type="submit">Create task</button>
      {message ? <p className="text-sm md:col-span-2">{message}</p> : null}
    </form>
  );
}

export function TaskStatus({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  return (
    <select
      className="min-h-11 rounded-xl bg-pitch px-2 text-sm"
      defaultValue={status}
      onChange={async (event) => {
        await send("/api/admin/tasks", { action: "update", id, status: event.target.value });
        router.refresh();
      }}
    >
      {["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"].map((item) => (
        <option key={item}>{item}</option>
      ))}
    </select>
  );
}

export function WalletAdjust({ users }: { users: { id: string; displayName: string }[] }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <form
      className="mt-4 grid gap-3 rounded-2xl border border-line bg-card p-4 md:grid-cols-2"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        try {
          await send("/api/admin/wallet-adjust", {
            userId: form.get("userId"),
            direction: form.get("direction"),
            rupees: form.get("rupees"),
            reason: form.get("reason"),
          });
          setMessage("Adjustment posted to the ledger.");
          router.refresh();
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Not posted.");
        }
      }}
    >
      <h3 className="font-semibold md:col-span-2">Manual cash adjustment</h3>
      <p className="text-sm text-muted md:col-span-2">This adds a balanced ledger journal. It does not overwrite history.</p>
      <label className="text-sm">Customer<select name="userId" className={field}>{users.map((user) => <option key={user.id} value={user.id}>{user.displayName}</option>)}</select></label>
      <label className="text-sm">Direction<select name="direction" className={field}><option value="credit">Credit cash</option><option value="debit">Debit cash</option></select></label>
      <label className="text-sm">Rupees<input name="rupees" required className={field} placeholder="100.00" /></label>
      <label className="text-sm">Reason<input name="reason" required minLength={3} className={field} /></label>
      <button className="min-h-11 rounded-full bg-india px-4 text-sm font-semibold" type="submit">Post adjustment</button>
      {message ? <p className="text-sm md:col-span-2">{message}</p> : null}
    </form>
  );
}

export function StaffCreate() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <form
      className="mt-4 grid gap-3 md:grid-cols-2"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        try {
          await send("/api/admin/staff", {
            action: "create",
            displayName: form.get("displayName"),
            phone: form.get("phone"),
            password: form.get("password"),
            staffRole: form.get("staffRole"),
            reason: form.get("reason"),
          });
          setMessage("Staff account created. They sign in with that phone.");
          router.refresh();
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Not created.");
        }
      }}
    >
      <label className="text-sm">Name<input name="displayName" required className={field} /></label>
      <label className="text-sm">Phone<input name="phone" required className={field} placeholder="9000000002" /></label>
      <label className="text-sm">Password<input name="password" required className={field} /></label>
      <label className="text-sm">Role<select name="staffRole" className={field}>{STAFF_ROLES.map((role) => <option key={role}>{role}</option>)}</select></label>
      <label className="text-sm md:col-span-2">Reason<input name="reason" required minLength={3} className={field} /></label>
      <button className="min-h-11 rounded-full bg-india px-4 text-sm font-semibold" type="submit">Create staff</button>
      {message ? <p className="text-sm">{message}</p> : null}
    </form>
  );
}

export function StaffRoleForm({ userId, staffRole, active }: { userId: string; staffRole: string; active: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        try {
          await send("/api/admin/staff", {
            action: "role",
            userId,
            staffRole: form.get("staffRole"),
            active: form.get("active") === "on",
            reason: form.get("reason"),
          });
          setMessage("Updated.");
          router.refresh();
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Not updated.");
        }
      }}
    >
      <select name="staffRole" defaultValue={staffRole} className="min-h-11 rounded-xl bg-pitch px-2 text-sm">
        {STAFF_ROLES.map((role) => (
          <option key={role}>{role}</option>
        ))}
      </select>
      <label className="flex items-center gap-2 text-sm"><input name="active" type="checkbox" defaultChecked={active} /> Active</label>
      <input name="reason" required minLength={3} placeholder="Reason" className="min-h-11 rounded-xl border border-line bg-pitch px-2 text-sm" />
      <button className="min-h-11 rounded-full bg-india px-3 text-sm" type="submit">Save</button>
      {message ? <span className="text-xs">{message}</span> : null}
    </form>
  );
}

export function NoteForm({ userId }: { userId: string }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <form
      className="mt-2 flex gap-2"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        try {
          await send("/api/admin/crm", { userId, body: form.get("body") });
          setMessage("Noted.");
          router.refresh();
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Not saved.");
        }
      }}
    >
      <input name="body" required className="min-h-11 flex-1 rounded-xl border border-line bg-pitch px-3 text-sm" placeholder="CRM note" />
      <button className="min-h-11 rounded-full bg-india px-3 text-sm" type="submit">Add</button>
      {message ? <span className="text-xs">{message}</span> : null}
    </form>
  );
}

export function SegmentCreate() {
  const router = useRouter();
  return (
    <form
      className="mt-4 flex flex-wrap gap-2"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        await send("/api/admin/segments", { action: "create", name: form.get("name"), description: form.get("description") });
        router.refresh();
      }}
    >
      <input name="name" required placeholder="Segment name" className="min-h-11 rounded-xl border border-line bg-pitch px-3" />
      <input name="description" placeholder="Description" className="min-h-11 rounded-xl border border-line bg-pitch px-3" />
      <button className="min-h-11 rounded-full bg-india px-4 text-sm" type="submit">Create</button>
    </form>
  );
}

export function SegmentMember({ segmentId, users }: { segmentId: string; users: { id: string; displayName: string }[] }) {
  const router = useRouter();
  return (
    <form
      className="mt-2 flex gap-2"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        await send("/api/admin/segments", { action: "add", segmentId, userId: form.get("userId") });
        router.refresh();
      }}
    >
      <select name="userId" className="min-h-11 rounded-xl bg-pitch px-2 text-sm">
        {users.map((user) => (
          <option key={user.id} value={user.id}>{user.displayName}</option>
        ))}
      </select>
      <button className="min-h-11 rounded-full bg-card-2 px-3 text-sm" type="submit">Add</button>
    </form>
  );
}

export function CampaignForm({ channel }: { channel?: "WHATSAPP" | "PUSH" | "IN_APP" }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <form
      className="mt-4 space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        try {
          await send("/api/admin/campaigns", {
            name: form.get("name"),
            channel: form.get("channel"),
            status: form.get("status"),
            body: form.get("body"),
          });
          setMessage("Campaign saved. Nothing is sent.");
          router.refresh();
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Not saved.");
        }
      }}
    >
      <input name="name" required placeholder="Campaign name" className={field} />
      <select name="channel" defaultValue={channel ?? "IN_APP"} className={field}>
        <option value="WHATSAPP">WHATSAPP</option>
        <option value="PUSH">PUSH</option>
        <option value="IN_APP">IN_APP</option>
      </select>
      <select name="status" className={field}><option>DRAFT</option><option>DISABLED</option></select>
      <textarea name="body" className={`${field} min-h-24 py-2`} placeholder="Copy" />
      <button className="min-h-11 rounded-full bg-india px-4 text-sm" type="submit">Save campaign</button>
      {message ? <p className="text-sm">{message}</p> : null}
    </form>
  );
}

export function AnnouncementForm() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <form
      className="mt-4 space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        try {
          await send("/api/admin/announcements", { title: form.get("title"), body: form.get("body"), status: form.get("status") });
          setMessage("Saved.");
          router.refresh();
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Not saved.");
        }
      }}
    >
      <input name="title" required placeholder="Title" className={field} />
      <textarea name="body" required className={`${field} min-h-24 py-2`} />
      <select name="status" className={field}><option>DRAFT</option><option>LIVE</option><option>DISABLED</option></select>
      <button className="min-h-11 rounded-full bg-india px-4 text-sm" type="submit">Save announcement</button>
      {message ? <p className="text-sm">{message}</p> : null}
    </form>
  );
}

export function ReferralForm({ users, enabled }: { users: { id: string; displayName: string }[]; enabled: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  if (!enabled) return <p className="mt-3 text-sm text-muted">New referral codes are paused. Existing codes stay on this page.</p>;
  return (
    <form
      className="mt-4 flex flex-wrap gap-2"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        try {
          await send("/api/admin/referrals", { userId: form.get("userId"), code: form.get("code") });
          setMessage("Code saved. It does not issue a bonus.");
          router.refresh();
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Not saved.");
        }
      }}
    >
      <select name="userId" className="min-h-11 rounded-xl bg-pitch px-2">
        {users.map((user) => (
          <option key={user.id} value={user.id}>{user.displayName}</option>
        ))}
      </select>
      <input name="code" required minLength={4} placeholder="CODE" className="min-h-11 rounded-xl border border-line bg-pitch px-3" />
      <button className="min-h-11 rounded-full bg-india px-4 text-sm" type="submit">Create code</button>
      {message ? <p className="w-full text-sm">{message}</p> : null}
    </form>
  );
}

export function WithdrawalIntervention({ paymentId }: { paymentId: string }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <form
      className="mt-2 flex flex-wrap gap-2"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        try {
          await send("/api/admin/withdrawals", { paymentId, reason: form.get("reason"), note: form.get("note") });
          setMessage("Review task opened. Payment status was not changed.");
          router.refresh();
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Not saved.");
        }
      }}
    >
      <input name="reason" required minLength={3} placeholder="Reason" className="min-h-11 rounded-xl border border-line bg-pitch px-3 text-sm" />
      <input name="note" placeholder="Note" className="min-h-11 rounded-xl border border-line bg-pitch px-3 text-sm" />
      <button className="min-h-11 rounded-full bg-card-2 px-3 text-sm" type="submit">Open review</button>
      {message ? <span className="text-xs">{message}</span> : null}
    </form>
  );
}

export function ExportButton() {
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="mt-4">
      <button
        type="button"
        className="min-h-11 rounded-full bg-india px-4 text-sm font-semibold"
        onClick={async () => {
          const response = await fetch("/api/admin/export", { method: "POST" });
          if (!response.ok) {
            const body = (await response.json()) as { error?: { message: string } };
            setMessage(body.error?.message ?? "Export failed.");
            return;
          }
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = "playerpulser-audience.csv";
          link.click();
          URL.revokeObjectURL(url);
          setMessage("Export downloaded.");
        }}
      >
        Download customer CSV
      </button>
      {message ? <p className="mt-2 text-sm">{message}</p> : null}
    </div>
  );
}
