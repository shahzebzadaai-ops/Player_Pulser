export const POLICY_REVIEW = "Draft for legal review. This is not a final legal opinion.";

export type PolicySlug =
  | "terms"
  | "privacy"
  | "cookies"
  | "risk-disclosure"
  | "bonus-terms"
  | "payment-policy"
  | "responsible-use"
  | "complaints";

export type PolicyDocument = {
  slug: PolicySlug;
  path: `/${PolicySlug}`;
  title: string;
  sections: { heading: string; body: string }[];
};

export const POLICIES: PolicyDocument[] = [
  {
    slug: "terms",
    path: "/terms",
    title: "Terms of Use",
    sections: [
      { heading: "Your account", body: "You are responsible for the phone number, password, and devices used on your account. Tell support if you think someone else is using it." },
      { heading: "How trading works", body: "PlayerPulser lets you buy and sell player positions at quoted prices. Prices can rise or fall. A spread is included in the buy and sell quotes. Profits are not guaranteed." },
      { heading: "Prices and market activity", body: "Prices use cricket information, market activity, and generated market movements. A simulation preview, when shown, is not a cash price and does not change your balance." },
      { heading: "Limits and interruptions", body: "Position limits and risk controls may stop a new order. A delayed, stale, or conflicting feed can pause new trades. Existing balances and positions stay on the ledger." },
      { heading: "Bonus", body: "The ₹200 Welcome Bonus follows the Bonus Terms and the amounts configured for your account. It is not a second payment for making a deposit." },
      { heading: "Payments", body: "Deposits and withdrawals follow the Payment Policy. A return from a payment page does not by itself add money. Money is added only after PlayerPulser verifies the payment." },
      { heading: "Abuse", body: "You may not open extra accounts to collect another welcome bonus, manipulate quotes, or interfere with the service. We may refuse a bonus or an order when the rules say so. We do not take an existing cash balance without a recorded reason." },
      { heading: "Availability and changes", body: "The service can be unavailable for maintenance or incidents. We may update these terms. The version you accepted is stored with your account. Support contacts are on the Complaints page." },
    ],
  },
  {
    slug: "privacy",
    path: "/privacy",
    title: "Privacy Policy",
    sections: [
      { heading: "Account data", body: "We store your phone number or email, display name, and the terms version you accepted." },
      { heading: "Device and session data", body: "We store session cookies and, when you allow it, a first-party visitor id used to understand which visit led to signup." },
      { heading: "Payments", body: "Payment providers process the transfer. We store our payment id, amount, status, and the provider reference. We do not store card numbers or crypto private keys in ordinary account records." },
      { heading: "Analytics and messages", body: "We record product events such as signup and deposit status, plus campaign labels from the link you opened. Support messages are kept to answer you. We do not put your phone number or wallet balance into browser marketing events." },
      { heading: "Security signals", body: "We may store a device reference or a payment-identity reference to decide whether a welcome bonus needs review. The detailed checks are not shown in the product." },
      { heading: "Who processes data", body: "Payment, hosting, and messaging providers process data so the service can run. We do not sell your account to advertisers. Marketing tags such as a Meta pixel are not loaded until a consent setting for them is in place." },
    ],
  },
  {
    slug: "cookies",
    path: "/cookies",
    title: "Cookie Policy",
    sections: [
      { heading: "Essential cookies", body: "The session cookie pp_session keeps you signed in. It is httpOnly and is marked Secure in production." },
      { heading: "Attribution cookies", body: "pp_vid identifies a visitor and pp_vst identifies a visit. They support first-party campaign reporting." },
      { heading: "Marketing cookies", body: "Analytics or marketing tags, including a future Meta pixel or tag manager, stay off until the consent setting for non-essential tags is satisfied. This milestone does not install those tags." },
    ],
  },
  {
    slug: "risk-disclosure",
    path: "/risk-disclosure",
    title: "Risk Disclosure",
    sections: [
      { heading: "Prices move", body: "Player prices can rise or fall. You can gain or lose. Past movement is not a promise of future movement." },
      { heading: "Feeds", body: "Cricket data can be delayed, incomplete, or unavailable. A stale feed is labeled. It is not treated as a new verified cricket event." },
      { heading: "How prices are set", body: "PlayerPulser sets prices using cricket information, market activity, and generated market movements. Limits may restrict a new order. Nothing here is a guaranteed investment profit." },
    ],
  },
  {
    slug: "bonus-terms",
    path: "/bonus-terms",
    title: "Bonus Terms",
    sections: [
      { heading: "Welcome bonus", body: "A new eligible account can receive one ₹200 Welcome Bonus. There is no separate deposit bonus. The amount, validity, and deposit needed before conversion come from the live bonus configuration, currently a welcome amount of ₹200." },
      { heading: "Use", body: "Bonus balance is not the same as cash. Trading rules can require the bonus to be paired with cash. Conversion to cash follows the wagering and deposit conditions already in the bonus engine." },
      { heading: "One bonus", body: "The welcome bonus is granted once for an eligible user. A repeated signup request does not create a second grant. If eligibility is uncertain, the account can still exist and the bonus can stay pending review or be marked not eligible. We do not silently remove cash that was already yours." },
    ],
  },
  {
    slug: "payment-policy",
    path: "/payment-policy",
    title: "Payment Policy",
    sections: [
      { heading: "Deposits", body: "The customer minimum deposit is ₹500. You choose an amount and a method category, Banking or Crypto, when a provider is enabled. No extra welcome bonus is added because you deposit." },
      { heading: "Status", body: "A payment can be pending, verifying, successful, failed, cancelled, or expired. Success is shown only after the server has verified it. Leaving the page does not cancel that check." },
      { heading: "Withdrawals", body: "Withdrawals use the current cash rules, including the configured minimum and the portion that stays in cash. A very small remainder is not a new fee. Provider delays can slow a payout." },
      { heading: "Retries and reversals", body: "Try again starts a separate payment attempt. The same verified provider transaction is not credited twice. A failed withdrawal returns the reserved cash through the ledger." },
    ],
  },
  {
    slug: "responsible-use",
    path: "/responsible-use",
    title: "Responsible Use",
    sections: [
      { heading: "Spending", body: "Deposit only money you can afford to use. Prices move both ways. The product does not use countdown pressure or guaranteed-profit messages." },
      { heading: "Support", body: "If you want to slow down, contact support from the Complaints page and include your account phone and any payment reference. Cool-off controls can be added later. They are not a live switch in this version." },
    ],
  },
  {
    slug: "complaints",
    path: "/complaints",
    title: "Complaints and Support",
    sections: [
      { heading: "Contact", body: "Write to support from the address on your account, or use the support path shown in the app when it is available. Include your display name, the phone or email on the account, and the payment or trade reference if you have one." },
      { heading: "What happens next", body: "We record the request and look up the ledger and payment status. We do not promise a clock time for a reply until that time is configured and staffed." },
    ],
  },
];

export function policyBySlug(slug: string): PolicyDocument | null {
  return POLICIES.find((policy) => policy.slug === slug) ?? null;
}
