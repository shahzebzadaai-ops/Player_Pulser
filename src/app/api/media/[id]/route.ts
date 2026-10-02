import { readMediaFile } from "@/server/media-store";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const file = await readMediaFile(id);
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(file.bytes, {
    headers: {
      "Content-Type": file.asset.mimeType,
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
