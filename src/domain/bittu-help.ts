import { formatPaise } from "./money";

export type HelpFacts = {
  welcomeBonus: string;
  validityDays: number;
  wageringMultiplier: number;
  qualifyingDeposit: string;
  minDeposit: string;
  minWithdrawal: string;
  cashPortionPercent: number;
  depositsEnabled: boolean;
  withdrawalsEnabled: boolean;
  welcomeBonusEnabled: boolean;
  bonusSystemEnabled: boolean;
  liveTradingEnabled: boolean;
  demoEnabled: boolean;
  demoCash: string;
};

export type HelpTopic = {
  id: string;
  question: string;
  keywords: string[];
  answer: string;
};

const MIN_DEPOSIT = "₹500";

export const SUGGESTED_QUESTIONS = [
  "How does PlayerPulser work?",
  "Can I browse players without an account?",
  "How do buying and selling work?",
  "Why do prices change?",
  "What is the difference between cash and bonus?",
  "Who can get the welcome bonus?",
  "How do deposits and withdrawals work?",
  "What is investor demo mode?",
  "How do I get into my account or contact support?",
] as const;

export function helpFacts(input: {
  welcomePaise: bigint;
  validityDays: number;
  wageringMultiplier: number;
  qualifyingDepositPaise: bigint;
  withdrawalMinPaise: bigint;
  cashPortionBps: number;
  depositsEnabled: boolean;
  withdrawalsEnabled: boolean;
  welcomeBonusEnabled: boolean;
  bonusSystemEnabled: boolean;
  liveTradingEnabled: boolean;
  demoEnabled: boolean;
  demoCashPaise: bigint;
}): HelpFacts {
  return {
    welcomeBonus: formatPaise(input.welcomePaise),
    validityDays: input.validityDays,
    wageringMultiplier: input.wageringMultiplier,
    qualifyingDeposit: formatPaise(input.qualifyingDepositPaise),
    minDeposit: MIN_DEPOSIT,
    minWithdrawal: formatPaise(input.withdrawalMinPaise),
    cashPortionPercent: Math.round(input.cashPortionBps / 100),
    depositsEnabled: input.depositsEnabled,
    withdrawalsEnabled: input.withdrawalsEnabled,
    welcomeBonusEnabled: input.welcomeBonusEnabled,
    bonusSystemEnabled: input.bonusSystemEnabled,
    liveTradingEnabled: input.liveTradingEnabled,
    demoEnabled: input.demoEnabled,
    demoCash: formatPaise(input.demoCashPaise),
  };
}

export function helpTopics(facts: HelpFacts): HelpTopic[] {
  const bonusState = !facts.bonusSystemEnabled
    ? "New bonuses are paused. An existing bonus balance stays on the account."
    : !facts.welcomeBonusEnabled
      ? "New welcome bonuses are paused. An existing welcome bonus stays on the account."
      : `A new eligible account can receive one ${facts.welcomeBonus} welcome bonus. It is not paid again when you deposit.`;
  return [
    {
      id: "how-it-works",
      question: SUGGESTED_QUESTIONS[0],
      keywords: ["how playerpulser", "what is playerpulser", "how it works", "how trading works", "how does playerpulser"],
      answer: "PlayerPulser lets you buy and sell fictional player positions at quoted prices. The buy and sell quotes include a spread. Prices can rise or fall, and profits are not guaranteed. A stale price feed pauses new trades. Existing balances and positions stay on the ledger.",
    },
    {
      id: "browse",
      question: SUGGESTED_QUESTIONS[1],
      keywords: ["without an account", "without account", "guest", "browse", "look at players", "sign up to view"],
      answer: "Yes. The landing page, Market, and each player page are open without an account. Buying or selling asks you to create an account or log in. Opening signup does not place a trade.",
    },
    {
      id: "buy-sell",
      question: SUGGESTED_QUESTIONS[2],
      keywords: ["buy", "sell", "trade", "order", "pulsers"],
      answer: facts.liveTradingEnabled
        ? `You choose a quantity and confirm at the quoted buy or sell price. At least ${facts.cashPortionPercent}% of a buy must be paid with cash, so bonus cannot pay for a buy on its own. A quote can expire, and a risk limit can stop a new order. I cannot place a trade for you.`
        : "New buys and sells are turned off right now. Positions and balances you already have stay where they are. I cannot place a trade for you.",
    },
    {
      id: "prices",
      question: SUGGESTED_QUESTIONS[3],
      keywords: ["price", "prices", "spread", "chart", "quote"],
      answer: "PlayerPulser sets prices from cricket information, market activity, and generated market movements. The chart shows the quoted price. Buy and sell prices already include the spread. Past movement is not a promise of future movement. A delayed feed is labeled and pauses new trades.",
    },
    {
      id: "cash-bonus",
      question: SUGGESTED_QUESTIONS[4],
      keywords: ["cash", "bonus balance", "bonus versus", "difference between"],
      answer: `Cash is the balance you can withdraw, subject to the withdrawal rules. Bonus is separate and can be used toward trading only together with cash. Withdrawable cash does not include bonus or bonus proceeds. Bonus becomes cash only after its wagering and deposit conditions are met.`,
    },
    {
      id: "welcome",
      question: SUGGESTED_QUESTIONS[5],
      keywords: ["welcome", "₹200", "200 bonus", "eligible", "eligibility"],
      answer: `${bonusState} The current welcome amount is ${facts.welcomeBonus}, valid for ${facts.validityDays} days, with wagering of ${facts.wageringMultiplier} times that amount and a qualifying deposit of ${facts.qualifyingDeposit}. A shared device or payment identity can leave the bonus under review instead of granting it. Buys count toward wagering. Sells do not.`,
    },
    {
      id: "payments",
      question: SUGGESTED_QUESTIONS[6],
      keywords: ["deposit", "withdraw", "upi", "bank", "payout", "payment"],
      answer: `The minimum deposit is ${facts.minDeposit}. The wallet offers UPI and Bank when deposits are on. ${facts.depositsEnabled ? "Deposits are available." : "Deposits are temporarily unavailable."} Money is added only after PlayerPulser verifies the payment. You can request withdrawal of up to 100% of your available cash balance. Submit a request and the team will process it. ${facts.withdrawalsEnabled ? "Withdrawals are available." : "Withdrawals are temporarily unavailable."}`,
    },
    {
      id: "demo",
      question: SUGGESTED_QUESTIONS[7],
      keywords: ["demo", "investor", "simulated"],
      answer: facts.demoEnabled
        ? `Try Live Demo opens one simulated account with ${facts.demoCash} in demo cash and a demo holding. Trades and money stay on that demo account. Deposits and withdrawals are blocked there. Exit Demo leaves it. Set INVESTOR_DEMO_ENABLED to false to hide new demo sessions.`
        : "New investor demo sessions are turned off. An existing demo session can still use Exit Demo. Demo money is simulated and cannot create a payment.",
    },
    {
      id: "account",
      question: SUGGESTED_QUESTIONS[8],
      keywords: ["login", "log in", "password", "google", "apple", "passkey", "support", "account", "forgot"],
      answer: "You can continue with Google, Apple, or email. Phone and a saved passkey stay under Phone or passkey. Google and Apple appear even when those providers are not configured, and the button explains what the server still needs. I cannot see your balance, change your settings, or reset a password from chat. For account help, use Settings or the Complaints page and include the phone or email on the account. Do not send a password or a one-time code.",
    },
  ];
}

export function matchHelpTopic(question: string, facts: HelpFacts): HelpTopic | null {
  const normalized = question.trim().toLowerCase().replace(/\s+/g, " ");
  if (normalized.length < 2) return null;
  let best: { topic: HelpTopic; score: number } | null = null;
  for (const topic of helpTopics(facts)) {
    const score = topic.keywords.reduce((total, keyword) => (normalized.includes(keyword) ? total + keyword.length : total), 0);
    if (score > 0 && (!best || score > best.score)) best = { topic, score };
  }
  return best?.topic ?? null;
}

export const BITTU_UNCERTAIN =
  "I'm not sure about that from the PlayerPulser help topics. I can't place a trade, move money, or change account settings. Open Help, or use the Complaints page and include the phone or email on the account. Please don't send a password or a one-time code.";

export function plainHelpText(value: string): string {
  return value.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, 1200);
}

export function bittuAiConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.BITTU_AI_API_KEY?.trim());
}
