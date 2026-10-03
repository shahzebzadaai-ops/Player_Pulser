import { notFound, permanentRedirect } from "next/navigation";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export default async function PublicPlayerRedirect({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!SLUG.test(slug)) notFound();
  permanentRedirect(`/players/${slug}`);
}