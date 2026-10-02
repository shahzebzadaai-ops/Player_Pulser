import { AppError } from "@/domain/errors";

export type AssistantContext = {
  placement?: string;
  name?: string;
  playerName?: string;
  topic?: string;
};

export interface AdminContentAssistant {
  generateHeadline(input: AssistantContext): Promise<string>;
  generateSubtitle(input: AssistantContext): Promise<string>;
  generateSeoDescription(input: AssistantContext): Promise<string>;
  generatePushCopy(input: AssistantContext): Promise<string>;
  generateWhatsAppCopy(input: AssistantContext): Promise<string>;
}

export class DisabledContentAssistant implements AdminContentAssistant {
  async generateHeadline(): Promise<string> {
    throw new AppError("ASSISTANT_DISABLED", "The content assistant is turned off.", 503);
  }

  async generateSubtitle(): Promise<string> {
    throw new AppError("ASSISTANT_DISABLED", "The content assistant is turned off.", 503);
  }

  async generateSeoDescription(): Promise<string> {
    throw new AppError("ASSISTANT_DISABLED", "The content assistant is turned off.", 503);
  }

  async generatePushCopy(): Promise<string> {
    throw new AppError("ASSISTANT_DISABLED", "The content assistant is turned off.", 503);
  }

  async generateWhatsAppCopy(): Promise<string> {
    throw new AppError("ASSISTANT_DISABLED", "The content assistant is turned off.", 503);
  }
}

export function contentAssistant(): AdminContentAssistant {
  return new DisabledContentAssistant();
}
