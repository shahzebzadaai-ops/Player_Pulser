"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MEDIA_FOLDERS } from "@/domain/banners";

export type MediaRow = {
  id: string;
  folder: string;
  filename: string;
  mimeType: string;
  bytes: number;
  width: number | null;
  height: number | null;
  altText: string;
  archived: boolean;
  createdAt: string;
  createdBy: string;
};

export function MediaManager({ assets }: { assets: MediaRow[] }) {
  const router = useRouter();
  const [folder, setFolder] = useState<(typeof MEDIA_FOLDERS)[number]>("BANNERS");
  const [message, setMessage] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const visible = assets.filter((asset) => showArchived || !asset.archived);

  async function upload(file: File) {
    const data = new FormData();
    data.set("file", file);
    data.set("folder", folder);
    const response = await fetch("/api/admin/media", { method: "POST", body: data });
    const body = (await response.json()) as { error?: { message: string } };
    setMessage(response.ok ? "Uploaded." : body.error?.message ?? "Upload failed.");
    if (response.ok) router.refresh();
  }

  async function act(action: "archive" | "alt" | "replace", asset: MediaRow, extra?: { altText?: string; file?: File }) {
    if (action === "replace" && extra?.file) {
      const data = new FormData();
      data.set("file", extra.file);
      data.set("folder", asset.folder);
      data.set("replaceId", asset.id);
      data.set("altText", asset.altText);
      const response = await fetch("/api/admin/media", { method: "POST", body: data });
      const body = (await response.json()) as { error?: { message: string } };
      setMessage(response.ok ? "Replaced." : body.error?.message ?? "Replace failed.");
      if (response.ok) router.refresh();
      return;
    }
    const response = await fetch("/api/admin/media", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, id: asset.id, altText: extra?.altText }),
    });
    const body = (await response.json()) as { error?: { message: string } };
    setMessage(response.ok ? "Saved." : body.error?.message ?? "Not saved.");
    if (response.ok) router.refresh();
  }

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          Folder
          <select className="mt-1 block min-h-11 rounded-xl border border-line bg-pitch px-3" value={folder} onChange={(event) => setFolder(event.target.value as (typeof MEDIA_FOLDERS)[number])}>
            {MEDIA_FOLDERS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Upload WebP, AVIF, PNG, or JPEG, up to 2MB
          <input
            className="mt-1 block text-sm"
            type="file"
            accept="image/webp,image/avif,image/png,image/jpeg"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
          />
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
          Show archived
        </label>
      </div>
      {message ? <p className="mt-3 text-sm">{message}</p> : null}
      <ul className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {visible.map((asset) => (
          <li key={asset.id} className="rounded-2xl border border-line bg-card p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/media/${asset.id}`} alt={asset.altText || asset.filename} className="h-32 w-full rounded-xl object-cover" />
            <p className="mt-2 text-sm font-semibold">{asset.filename}</p>
            <p className="text-xs text-muted">
              {asset.folder} · {asset.mimeType} · {Math.ceil(asset.bytes / 1024)} KB
              {asset.width && asset.height ? ` · ${asset.width}x${asset.height}` : ""}
            </p>
            <p className="text-xs text-muted">
              {asset.createdBy} · {asset.createdAt}
              {asset.archived ? " · archived" : ""}
            </p>
            <form
              className="mt-2 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const altText = String(new FormData(event.currentTarget).get("alt") ?? "");
                void act("alt", asset, { altText });
              }}
            >
              <input name="alt" defaultValue={asset.altText} className="min-h-11 flex-1 rounded-xl border border-line bg-pitch px-2 text-sm" aria-label="Alt text" />
              <button className="min-h-11 rounded-full bg-india px-3 text-sm" type="submit">
                Alt
              </button>
            </form>
            <div className="mt-2 flex flex-wrap gap-2">
              <label className="min-h-11 cursor-pointer rounded-full bg-card-2 px-3 py-2 text-sm">
                Replace
                <input
                  className="sr-only"
                  type="file"
                  accept="image/webp,image/avif,image/png,image/jpeg"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void act("replace", asset, { file });
                  }}
                />
              </label>
              {asset.archived ? null : (
                <button className="min-h-11 rounded-full bg-card-2 px-3 text-sm" type="button" onClick={() => act("archive", asset)}>
                  Archive
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
