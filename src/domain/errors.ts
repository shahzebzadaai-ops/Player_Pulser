import type { RuleResult } from "./rules";
import { WITHDRAWAL_RULE_UNRESOLVED } from "./rules";

export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, string>;

  constructor(code: string, message: string, status = 400, details?: Record<string, string>) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function unwrap<T>(result: RuleResult<T>): T {
  if (result.ok) return result.value;
  const status = result.code === WITHDRAWAL_RULE_UNRESOLVED ? 409 : 400;
  throw new AppError(result.code, result.message, status);
}
