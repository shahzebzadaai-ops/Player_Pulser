import Link from "next/link";
import { BittuFigure } from "@/components/bittu-figure";
import { SettingsPanel } from "@/components/settings-panel";
import { authFlags } from "@/domain/auth-flags";
import { requireCustomer } from "@/server/page-access";
import { prisma } from "@/server/prisma";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireCustomer();
  const google = await prisma.authIdentity.findFirst({
    where: { userId: user.id, provider: "GOOGLE" },
    select: { id: true },
  });
  const flags = authFlags();
  return (
    <main className="px-4 pt-4">
      <h1 className="text-2xl font-bold">Settings</h1>
      <Link href="/help" className="mt-4 flex items-center gap-3 rounded-2xl bg-card p-3">
        <BittuFigure pose="explain" className="h-14 w-auto shrink-0" />
        <span>
          <span className="block font-semibold">Ask Bittu</span>
          <span className="block text-sm text-muted">Help and answers from the current product rules</span>
        </span>
      </Link>
      <div className="mt-4">
        <SettingsPanel
          givenName={user.givenName}
          familyName={user.familyName}
          username={user.username}
          email={user.email}
          phone={user.phone}
          avatarUrl={user.avatarUrl}
          emailVerified={Boolean(user.emailVerifiedAt)}
          phoneVerified={Boolean(user.phoneVerifiedAt)}
          googleConnected={Boolean(google)}
          googleAvailable={flags.googleEnabled}
          passwordAvailable={flags.legacyPasswordEnabled}
          marketingConsent={user.marketingConsent}
          doNotEmail={user.doNotEmail}
          doNotSms={user.doNotSms}
          doNotWhatsApp={user.doNotWhatsApp}
          doNotCall={user.doNotCall}
        />
      </div>
    </main>
  );
}
