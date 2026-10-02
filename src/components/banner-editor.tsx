"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PLACEMENT_SIZE, type BannerPlacementName } from "@/domain/banners";

export type BannerFormValue = {
  id: string | null;
  name: string;
  placement: BannerPlacementName;
  headline: string;
  subtitle: string;
  imageId: string | null;
  mobileImageId: string | null;
  ctaLabel: string;
  ctaDestination: string;
  altText: string;
  startAt: string;
  endAt: string;
  sortOrder: number;
  status: string;
  publishedAt: string | null;
};

const field = "mt-1 min-h-11 w-full rounded-xl border border-line bg-pitch px-3";

async function post(body: unknown) {
  const response = await fetch("/api/admin/banners", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as { id?: string; error?: { message: string }; archived?: boolean };
  if (!response.ok) throw new Error(payload.error?.message ?? "Not saved.");
  return payload;
}

export function BannerEditor({ initial }: { initial: BannerFormValue }) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const size = PLACEMENT_SIZE[form.placement];
  const previewImage = form.mobileImageId ?? form.imageId;

  function set<K extends keyof BannerFormValue>(key: K, value: BannerFormValue[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function upload(file: File, target: "imageId" | "mobileImageId") {
    const data = new FormData();
    data.set("file", file);
    data.set("folder", "BANNERS");
    data.set("altText", form.altText);
    const response = await fetch("/api/admin/media", { method: "POST", body: data });
    const body = (await response.json()) as { id?: string; width?: number | null; height?: number | null; error?: { message: string } };
    if (!response.ok || !body.id) throw new Error(body.error?.message ?? "Upload failed.");
    set(target, body.id);
    const recommended = target === "mobileImageId" ? "Use a taller crop for phones." : `${size.width}x${size.height}`;
    if (body.width && body.height && (body.width !== size.width || body.height !== size.height)) {
      setMessage(`Uploaded ${body.width}x${body.height}. Recommended ${recommended}.`);
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      const payload = await post({
        action: form.id ? "update" : "create",
        ...form,
        id: form.id ?? undefined,
        startAt: form.startAt || null,
        endAt: form.endAt || null,
      });
      setMessage("Saved as draft.");
      if (!form.id && payload.id) router.push(`/admin/content/banners/${payload.id}`);
      else router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Not saved.");
    } finally {
      setPending(false);
    }
  }

  async function act(action: "publish" | "disable" | "duplicate" | "delete") {
    if (!form.id) return;
    setPending(true);
    try {
      if (action === "publish") {
        await post({
          action: "update",
          ...form,
          id: form.id,
          startAt: form.startAt || null,
          endAt: form.endAt || null,
        });
      }
      const payload = await post(action === "publish" ? { action, id: form.id, previewed: true } : { action, id: form.id });
      setMessage(action === "delete" && payload.archived ? "Archived. Live history is kept." : "Done.");
      if (action === "duplicate" && payload.id) router.push(`/admin/content/banners/${payload.id}`);
      else if (action === "delete" && !payload.archived) router.push("/admin/content/banners");
      else router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Not completed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={save} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
      <div className="space-y-3">
        <label className="block text-sm">
          Name
          <input className={field} value={form.name} onChange={(event) => set("name", event.target.value)} required />
        </label>
        <label className="block text-sm">
          Placement
          <select className={field} value={form.placement} onChange={(event) => set("placement", event.target.value as BannerPlacementName)}>
            {Object.keys(PLACEMENT_SIZE).map((placement) => (
              <option key={placement} value={placement}>
                {placement}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-muted">
          Recommended {size.width}x{size.height}. Preferred format WebP or AVIF. Maximum 2MB.
        </p>
        <label className="block text-sm">
          Headline
          <input className={field} value={form.headline} onChange={(event) => set("headline", event.target.value)} required />
        </label>
        <label className="block text-sm">
          Subtitle
          <input className={field} value={form.subtitle} onChange={(event) => set("subtitle", event.target.value)} />
        </label>
        <label className="block text-sm">
          Alt text
          <input className={field} value={form.altText} onChange={(event) => set("altText", event.target.value)} />
        </label>
        <label className="block text-sm">
          Desktop image
          <input
            className={field}
            type="file"
            accept="image/webp,image/avif,image/png,image/jpeg"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file, "imageId").catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Upload failed."));
            }}
          />
        </label>
        <label className="block text-sm">
          Mobile image, optional
          <input
            className={field}
            type="file"
            accept="image/webp,image/avif,image/png,image/jpeg"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file, "mobileImageId").catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Upload failed."));
            }}
          />
        </label>
        <label className="block text-sm">
          Button label
          <input className={field} value={form.ctaLabel} onChange={(event) => set("ctaLabel", event.target.value)} />
        </label>
        <label className="block text-sm">
          Button destination
          <input className={field} value={form.ctaDestination} onChange={(event) => set("ctaDestination", event.target.value)} placeholder="/market" />
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-sm">
            Start
            <input className={field} type="datetime-local" value={form.startAt} onChange={(event) => set("startAt", event.target.value)} />
          </label>
          <label className="block text-sm">
            End
            <input className={field} type="datetime-local" value={form.endAt} onChange={(event) => set("endAt", event.target.value)} />
          </label>
          <label className="block text-sm">
            Sort order
            <input className={field} type="number" min={0} value={form.sortOrder} onChange={(event) => set("sortOrder", Number(event.target.value))} />
          </label>
        </div>
        <p className="text-xs text-muted">Status {form.status}. A future start time schedules the banner when you publish.</p>
        <div className="flex flex-wrap gap-2">
          <button disabled={pending} className="min-h-11 rounded-full bg-india px-4 text-sm font-semibold disabled:opacity-50" type="submit">
            Save draft
          </button>
          {form.id ? (
            <>
              <button disabled={pending} className="min-h-11 rounded-full bg-card-2 px-4 text-sm" type="button" onClick={() => act("duplicate")}>
                Duplicate
              </button>
              <button disabled={pending} className="min-h-11 rounded-full bg-card-2 px-4 text-sm" type="button" onClick={() => act("disable")}>
                Disable
              </button>
              <button disabled={pending} className="min-h-11 rounded-full bg-card-2 px-4 text-sm" type="button" onClick={() => act("delete")}>
                {form.status === "DRAFT" && !form.publishedAt ? "Delete draft" : "Archive"}
              </button>
            </>
          ) : null}
        </div>
        {message ? <p className="text-sm">{message}</p> : null}
      </div>
      <aside>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Mobile preview</p>
        <div className="mt-2 w-full max-w-[390px] overflow-hidden rounded-[2rem] border border-line bg-pitch-2 p-3">
          <article className="overflow-hidden rounded-3xl bg-card">
            {previewImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/media/${previewImage}`} alt={form.altText || form.headline} className="h-44 w-full object-cover" />
            ) : (
              <div className="flex h-44 items-center justify-center text-sm text-muted">No image yet</div>
            )}
            <div className="p-4">
              <p className="text-lg font-bold">{form.headline || "Headline"}</p>
              {form.subtitle ? <p className="mt-1 text-sm text-muted">{form.subtitle}</p> : null}
              {form.ctaLabel ? <span className="mt-3 inline-flex min-h-11 items-center rounded-full bg-india px-4 text-sm font-semibold">{form.ctaLabel}</span> : null}
            </div>
          </article>
        </div>
        {form.id ? (
          <button disabled={pending} className="mt-3 min-h-11 rounded-full bg-india px-4 text-sm font-semibold disabled:opacity-50" type="button" onClick={() => act("publish")}>
            Publish after preview
          </button>
        ) : (
          <p className="mt-3 text-xs text-muted">Save the draft, review this preview, then publish.</p>
        )}
      </aside>
    </form>
  );
}

export function AssistantHint() {
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="mt-3">
      <button
        type="button"
        className="min-h-11 rounded-full bg-card px-4 text-sm"
        onClick={async () => {
          const response = await fetch("/api/admin/assistant", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ method: "generateHeadline", topic: "banner" }),
          });
          const body = (await response.json()) as { error?: { message: string } };
          setMessage(body.error?.message ?? "No suggestion.");
        }}
      >
        Ask content assistant
      </button>
      {message ? <p className="mt-2 text-sm text-muted">{message}</p> : null}
    </div>
  );
}
