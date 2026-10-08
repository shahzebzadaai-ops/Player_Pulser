import {
  BITTU_UNCERTAIN,
  bittuAiConfigured,
  helpFacts,
  helpTopics,
  matchHelpTopic,
  plainHelpText,
  type HelpFacts,
} from "@/domain/bittu-help";
import { INVESTOR_DEMO_CASH_PAISE, investorDemoEnabled } from "@/domain/investor-demo";
import { getFeatures } from "./features";
import { getSettings } from "./settings";

export type BittuReply = {
  text: string;
  mode: "help" | "assistant";
  provider: "off" | "on" | "error";
  topicId: string | null;
};

export async function currentHelpFacts(): Promise<HelpFacts> {
  const [settings, features] = await Promise.all([getSettings(), getFeatures()]);
  return helpFacts({
    welcomePaise: settings.bonusWelcomePaise,
    validityDays: settings.bonusValidityDays,
    wageringMultiplier: settings.bonusWageringMultiplier,
    qualifyingDepositPaise: settings.bonusMinQualifyingDepositPaise,
    withdrawalMinPaise: settings.withdrawalMinPaise,
    cashPortionBps: settings.bonusMinCashPortionBps,
    depositsEnabled: features.depositsEnabled,
    withdrawalsEnabled: features.withdrawalsEnabled,
    welcomeBonusEnabled: features.welcomeBonusEnabled,
    bonusSystemEnabled: features.bonusSystemEnabled,
    liveTradingEnabled: features.liveTradingEnabled,
    demoEnabled: investorDemoEnabled(),
    demoCashPaise: INVESTOR_DEMO_CASH_PAISE,
  });
}

export async function answerBittu(question: string): Promise<BittuReply> {
  const facts = await currentHelpFacts();
  const topic = matchHelpTopic(question, facts);
  const fallback = topic?.answer ?? BITTU_UNCERTAIN;
  if (!bittuAiConfigured()) {
    return { text: fallback, mode: "help", provider: "off", topicId: topic?.id ?? null };
  }
  try {
    const text = await askProvider(question, facts);
    return { text, mode: "assistant", provider: "on", topicId: topic?.id ?? null };
  } catch {
    return { text: fallback, mode: "help", provider: "error", topicId: topic?.id ?? null };
  }
}

async function askProvider(question: string, facts: HelpFacts): Promise<string> {
  const base = (process.env.BITTU_AI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.BITTU_AI_MODEL || "gpt-4o-mini";
  const topics = helpTopics(facts).map((topic) => ({ question: topic.question, answer: topic.answer }));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.BITTU_AI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 280,
        messages: [
          {
            role: "system",
            content: [
              "You are Bittu, PlayerPulser's automated help assistant. You are not a person.",
              "Answer only from these help facts:",
              JSON.stringify(topics),
              "If they do not cover the question, say you are not sure and point to Help and the Complaints page.",
              "Never promise profit. Never ask for a password, one-time code, or payment secret.",
              "Never say you placed a trade, moved money, or changed settings.",
              "Do not mention environment variables, secrets, or other customers.",
              "Keep the reply under 120 words. Plain text only.",
            ].join(" "),
          },
          { role: "user", content: question.slice(0, 400) },
        ],
      }),
    });
    if (!response.ok) throw new Error("provider");
    const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = plainHelpText(body.choices?.[0]?.message?.content ?? "");
    if (!text) throw new Error("empty");
    return text;
  } finally {
    clearTimeout(timer);
  }
}
