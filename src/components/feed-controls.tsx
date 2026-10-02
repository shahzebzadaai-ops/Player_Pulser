"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function FeedForm({
  action,
  title,
  fields,
  hidden,
  submitLabel = "Save",
}: {
  action: string;
  title: string;
  fields: { name: string; label: string; type?: string; options?: { value: string; label: string }[]; defaultValue?: string }[];
  hidden?: Record<string, string | boolean>;
  submitLabel?: string;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  async function submit(formData: FormData) {
    const body: Record<string, string | number | boolean> = { action, reason, ...hidden };
    for (const field of fields) {
      const value = String(formData.get(field.name) ?? "");
      body[field.name] = field.type === "number" ? Number(value) : field.type === "boolean" ? value === "true" : value;
    }
    const response = await fetch("/api/admin/feed", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as { error?: { message: string } };
    setMessage(response.ok ? "Saved" : payload.error?.message ?? "Not saved");
    if (response.ok) router.refresh();
  }
  return (
    <form className="space-y-2 rounded-2xl border border-line bg-card p-3" action={(formData) => void submit(formData)}>
      <p className="text-sm font-semibold">{title}</p>
      {fields.map((field) => (
        <label key={field.name} className="block text-xs text-muted">
          {field.label}
          {field.options ? (
            <select name={field.name} defaultValue={field.defaultValue} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-pitch px-2 text-sm text-ink">
              {field.options.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          ) : (
            <input name={field.name} type={field.type === "number" ? "number" : field.type === "datetime-local" ? "datetime-local" : "text"} defaultValue={field.defaultValue} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-pitch px-2 text-sm text-ink" />
          )}
        </label>
      ))}
      <input className="min-h-11 w-full rounded-xl border border-line bg-pitch px-2 text-sm" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason for this feed change" />
      <button className="min-h-11 rounded-full bg-india px-3 text-sm text-white" type="submit">{submitLabel}</button>
      {message ? <p className="text-xs text-muted">{message}</p> : null}
    </form>
  );
}
