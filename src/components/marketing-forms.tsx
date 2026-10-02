"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { buildCampaignUrl } from "@/domain/attribution";

const field = "mt-1 min-h-11 w-full rounded-xl border border-line bg-pitch px-3";

async function send(url: string, body: unknown) {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const payload = (await response.json()) as { error?: { message: string } };
  if (!response.ok) throw new Error(payload.error?.message ?? "Not saved.");
}

export function UtmBuilder({
  sources,
  mediums,
  canManage,
}: {
  sources: string[];
  mediums: string[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [destination, setDestination] = useState("/");
  const [source, setSource] = useState(sources[0] ?? "meta");
  const [medium, setMedium] = useState(mediums[0] ?? "paid_social");
  const [campaign, setCampaign] = useState("");
  const [content, setContent] = useState("");
  const [term, setTerm] = useState("");
  const [name, setName] = useState("");
  const [adSet, setAdSet] = useState("");
  const [adName, setAdName] = useState("");
  const [creativeName, setCreativeName] = useState("");
  const [notes, setNotes] = useState("");
  const [customSource, setCustomSource] = useState("");
  const [customMedium, setCustomMedium] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const origin = typeof window === "undefined" ? "http://localhost:3000" : window.location.origin;
  const built = useMemo(
    () => buildCampaignUrl({ origin, destination, source: customSource || source, medium: customMedium || medium, campaign, content, term }),
    [origin, destination, source, medium, campaign, content, term, customSource, customMedium],
  );

  return (
    <form
      className="mt-4 grid gap-3 md:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        if ("error" in built) {
          setMessage(built.error);
          return;
        }
        void send("/api/admin/campaign-links", {
          name,
          destination,
          source: customSource || source,
          medium: customMedium || medium,
          campaign,
          content,
          term,
          adSet,
          adName,
          creativeName,
          notes,
        })
          .then(() => {
            setMessage("Campaign link saved.");
            router.refresh();
          })
          .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Not saved."));
      }}
    >
      <label className="text-sm">Destination URL<input className={field} value={destination} onChange={(event) => setDestination(event.target.value)} required /></label>
      <label className="text-sm">Name<input className={field} value={name} onChange={(event) => setName(event.target.value)} required minLength={2} /></label>
      <label className="text-sm">Source<select className={field} value={source} onChange={(event) => setSource(event.target.value)}>{sources.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label className="text-sm">Medium<select className={field} value={medium} onChange={(event) => setMedium(event.target.value)}>{mediums.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label className="text-sm">Custom source<input className={field} value={customSource} onChange={(event) => setCustomSource(event.target.value)} placeholder="Optional approved addition" /></label>
      <label className="text-sm">Custom medium<input className={field} value={customMedium} onChange={(event) => setCustomMedium(event.target.value)} placeholder="Optional approved addition" /></label>
      <label className="text-sm">Campaign<input className={field} value={campaign} onChange={(event) => setCampaign(event.target.value)} required /></label>
      <label className="text-sm">Content<input className={field} value={content} onChange={(event) => setContent(event.target.value)} /></label>
      <label className="text-sm">Term<input className={field} value={term} onChange={(event) => setTerm(event.target.value)} /></label>
      <label className="text-sm">Ad set name<input className={field} value={adSet} onChange={(event) => setAdSet(event.target.value)} /></label>
      <label className="text-sm">Ad name<input className={field} value={adName} onChange={(event) => setAdName(event.target.value)} /></label>
      <label className="text-sm">Creative name<input className={field} value={creativeName} onChange={(event) => setCreativeName(event.target.value)} /></label>
      <label className="text-sm md:col-span-2">Notes<textarea className={field} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
      <div className="md:col-span-2 rounded-2xl border border-line bg-card p-3 text-sm">
        <p className="text-xs text-muted">Generated URL</p>
        <p className="mt-1 break-all">{"url" in built ? built.url : built.error}</p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            className="min-h-11 rounded-full bg-card-2 px-4 text-sm"
            onClick={() => {
              if ("url" in built) void navigator.clipboard.writeText(built.url).then(() => setMessage("URL copied."));
            }}
          >
            Copy URL
          </button>
          {canManage ? <button className="min-h-11 rounded-full bg-india px-4 text-sm" type="submit">Save campaign link</button> : <p className="self-center text-sm text-muted">You can preview links. Saving requires UTM manage.</p>}
        </div>
      </div>
      {message ? <p className="text-sm md:col-span-2">{message}</p> : null}
    </form>
  );
}

export function TaxonomyEditor({ sources, mediums }: { sources: string[]; mediums: string[] }) {
  const router = useRouter();
  const [source, setSource] = useState("");
  const [medium, setMedium] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  return (
    <form
      className="mt-4 grid gap-3 md:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        void send("/api/admin/utm-taxonomy", { source, medium })
          .then(() => {
            setMessage("Taxonomy updated.");
            setSource("");
            setMedium("");
            router.refresh();
          })
          .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Not saved."));
      }}
    >
      <label className="text-sm">Add source<input className={field} value={source} onChange={(event) => setSource(event.target.value)} placeholder="partner_name" /></label>
      <label className="text-sm">Add medium<input className={field} value={medium} onChange={(event) => setMedium(event.target.value)} placeholder="paid_social" /></label>
      <button className="min-h-11 rounded-full bg-india px-4 text-sm md:col-span-2 md:w-fit" type="submit">Save taxonomy</button>
      {message ? <p className="text-sm md:col-span-2">{message}</p> : null}
    </form>
  );
}

export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="min-h-10 rounded-full bg-card-2 px-3 text-xs"
      onClick={() => {
        void navigator.clipboard.writeText(url).then(() => setCopied(true));
      }}
    >
      {copied ? "Copied" : "Copy URL"}
    </button>
  );
}

export function LinkStatusButton({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const next = status === "ACTIVE" ? "PAUSED" : status === "PAUSED" ? "ARCHIVED" : "ACTIVE";
  return (
    <button
      type="button"
      className="min-h-10 rounded-full bg-card-2 px-3 text-xs"
      onClick={() => {
        void send("/api/admin/campaign-links", { id, status: next }).then(() => router.refresh());
      }}
    >
      Mark {next.toLowerCase()}
    </button>
  );
}

export function ExportPresets() {
  const [message, setMessage] = useState<string | null>(null);
  async function download(preset: string, label: string) {
    const response = await fetch("/api/admin/export", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ preset }),
    });
    if (!response.ok) {
      const body = (await response.json()) as { error?: { message: string } };
      setMessage(body.error?.message ?? "Export failed.");
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `playerpulser-${preset}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setMessage(`${label} downloaded.`);
  }
  const presets = [
    ["all", "All customers"],
    ["registered_no_deposit", "Registered No Deposit"],
    ["deposited_no_trade", "Deposited No Trade"],
    ["churn_risk", "Churn Risk"],
    ["active_traders", "Active Traders"],
    ["bonus_expired", "Bonus Expired"],
    ["vip", "VIP"],
    ["high_value", "High Value"],
    ["player_holders", "Player Holders"],
  ] as const;
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {presets.map(([id, label]) => (
        <button key={id} type="button" className="min-h-11 rounded-full bg-card px-4 text-sm" onClick={() => void download(id, label)}>
          {label}
        </button>
      ))}
      {message ? <p className="basis-full text-sm">{message}</p> : null}
    </div>
  );
}
