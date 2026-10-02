import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { POLICY_REVIEW, policyBySlug } from "@/domain/policies";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const policy = policyBySlug(slug);
  if (!policy) return { robots: { index: false, follow: false } };
  return { title: policy.title, robots: { index: true, follow: true } };
}

export default async function PolicyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const policy = policyBySlug(slug);
  if (!policy) notFound();
  return (
    <main className="mx-auto min-h-dvh w-full max-w-[720px] px-4 py-8">
      <p className="text-xs text-muted">{POLICY_REVIEW}</p>
      <h1 className="mt-2 text-3xl font-bold">{policy.title}</h1>
      {policy.sections.map((section) => (
        <section key={section.heading} className="mt-6">
          <h2 className="text-lg font-semibold">{section.heading}</h2>
          <p className="mt-2 text-sm leading-6 text-muted">{section.body}</p>
        </section>
      ))}
      <p className="mt-8 text-sm">
        <Link className="text-india" href="/">Back to PlayerPulser</Link>
      </p>
    </main>
  );
}
