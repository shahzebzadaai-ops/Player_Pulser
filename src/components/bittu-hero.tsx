import { BittuPromoBanner } from "./bittu-promo-banner";

export function BittuHero({ signedIn }: { signedIn: boolean }) {
  return (
    <BittuPromoBanner
      className="mt-6"
      variant="primary"
      pose="present"
      priority
      eyebrow="Trade the Pulse of Cricket"
      title="Hi, I'm Bittu!"
      line="Register karo aur pao"
      offer="₹200 BONUS"
      description="Sign up and get your welcome bonus."
      ctaLabel={signedIn ? "Your home" : "Sign up"}
      ctaHref={signedIn ? "/home" : "/?auth=signup"}
      helpLabel="Help chahiye? Ask Bittu"
    />
  );
}
