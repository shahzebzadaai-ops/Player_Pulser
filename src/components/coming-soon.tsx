import { COMING_SOON_HEADLINE, COMING_SOON_NOTE, COMING_SOON_SUBTEXT } from "@/domain/launch-shield";

export const comingSoonMetadata = {
  title: { absolute: "PlayerPulser" },
  description: COMING_SOON_SUBTEXT,
  robots: { index: false, follow: false },
};

export function ComingSoon() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col items-center justify-center px-6 py-16 text-center">
      <img src="/brand/playerpulser-logo.png" alt="PlayerPulser" width={1024} height={377} className="h-14 w-auto max-w-[16rem]" />
      <p className="mt-8 text-xs font-semibold tracking-[0.18em] text-india">COMING SOON</p>
      <h1 className="mt-3 text-[clamp(1.8rem,8vw,2.4rem)] font-bold leading-tight">{COMING_SOON_HEADLINE}</h1>
      <p className="mt-4 text-sm text-muted">{COMING_SOON_SUBTEXT}</p>
      <p className="mt-6 text-xs text-muted">{COMING_SOON_NOTE}</p>
    </main>
  );
}
