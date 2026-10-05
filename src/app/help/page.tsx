import type { Metadata } from "next";
import Link from "next/link";
import { BittuFigure } from "@/components/bittu-figure";
import { helpTopics } from "@/domain/bittu-help";
import { currentHelpFacts } from "@/server/bittu-chat";

export const metadata: Metadata = { title: "Help" };

export default async function HelpPage() {
  const topics = helpTopics(await currentHelpFacts());
  return (
    <main className="mx-auto min-h-dvh w-full max-w-[430px] px-4 pb-16 pt-5">
      <Link href="/" className="text-sm text-india">
        PlayerPulser
      </Link>
      <div className="mt-4 flex items-end gap-3">
        <BittuFigure pose="ready" className="h-28 w-auto shrink-0" />
        <div>
          <h1 className="text-2xl font-bold">Help</h1>
          <p className="mt-1 text-sm text-muted">Bittu is an automated assistant. These answers follow the current PlayerPulser rules. They are not a promise of profit.</p>
        </div>
      </div>
      <ul className="mt-6 space-y-3">
        {topics.map((topic) => (
          <li key={topic.id} className="rounded-3xl bg-card p-4">
            <h2 className="font-semibold">{topic.question}</h2>
            <p className="mt-2 text-sm text-muted">{topic.answer}</p>
          </li>
        ))}
      </ul>
      <section className="mt-4 flex items-center gap-3 rounded-3xl bg-card p-4">
        <BittuFigure pose="shield" className="h-16 w-auto shrink-0" />
        <p className="text-sm text-muted">
          For an account problem, open <Link className="text-india" href="/complaints">Complaints</Link> and include the phone or email on the account. Don&apos;t send a password or a one-time code.
        </p>
      </section>
    </main>
  );
}
