"use client";

import { useState } from "react";

type LinkRow = {
  id: string;
  label: string | null;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  status: "ACTIVE" | "USED" | "REVOKED" | "EXPIRED";
};

function when(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", { hour12: false });
}

export function InvestorPreviewPanel({ links }: { links: LinkRow[] }) {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);

  async function generate(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    setCopied(false);
    const response = await fetch("/api/admin/investor-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label }),
    });
    const body = (await response.json().catch(() => null)) as { url?: string; error?: { message?: string } } | null;
    setPending(false);
    if (!response.ok || !body?.url) {
      setError(body?.error?.message ?? "Could not create a preview link.");
      return;
    }
    setUrl(body.url);
  }

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
  }

  async function revoke(id: string) {
    const response = await fetch("/api/admin/investor-preview", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (response.ok) window.location.reload();
  }

  return (
    <div className="mt-6">
      <form onSubmit={generate} className="grid max-w-xl gap-3">
        <label className="grid gap-1 text-sm">
          Investor name / note
          <input className="rounded-xl border border-line bg-pitch px-3 py-3" value={label} onChange={(event) => setLabel(event.target.value)} maxLength={80} placeholder="Optional" />
        </label>
        <button className="btn-primary w-fit" type="submit" disabled={pending}>
          {pending ? "Generating" : "Generate 15-minute link"}
        </button>
      </form>
      {error ? <p className="mt-3 text-sm text-loss">{error}</p> : null}
      {url ? (
        <div className="mt-4 max-w-xl rounded-2xl border border-line bg-card p-4">
          <p className="text-sm font-semibold">Expires in 15 minutes</p>
          <p className="mt-2 break-all text-sm">{url}</p>
          <button className="btn-secondary mt-3" type="button" onClick={copy}>
            {copied ? "Copied" : "Copy Link"}
          </button>
          <p className="mt-2 text-xs text-muted">This is the only time the raw link is shown.</p>
        </div>
      ) : null}
      <div className="mt-8 overflow-x-auto">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="text-xs text-muted">
            <tr>
              <th className="py-2 pr-3">Label</th>
              <th className="py-2 pr-3">Created</th>
              <th className="py-2 pr-3">Expires</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 pr-3">Used at</th>
              <th className="py-2"> </th>
            </tr>
          </thead>
          <tbody>
            {links.map((link) => (
              <tr key={link.id} className="border-t border-line">
                <td className="py-2 pr-3">{link.label || "—"}</td>
                <td className="py-2 pr-3">{when(link.createdAt)}</td>
                <td className="py-2 pr-3">{when(link.expiresAt)}</td>
                <td className="py-2 pr-3">{link.status}</td>
                <td className="py-2 pr-3">{when(link.usedAt)}</td>
                <td className="py-2">
                  {link.status === "ACTIVE" ? (
                    <button className="text-sm text-loss" type="button" onClick={() => revoke(link.id)}>
                      Revoke
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
