import type { PiContextUsage, PiExtensionContext } from "@pi-setup/pi-kit";

export const HISTORY_NOTE_CUSTOM_TYPE = "context-management-history-note";
export const DEFAULT_REMINDER_THRESHOLD_TOKENS = 32_000;
export const MAX_HISTORY_NOTE_CHARS = 12_000;

export interface ContextManagementEnvironment {
  PI_CONTEXT_MANAGEMENT_EXPERIMENTAL_MODE?: string;
  PI_CONTEXT_MANAGEMENT_REMINDER_TOKENS?: string;
}

export interface ContextMessageLike {
  customType?: unknown;
  [key: string]: unknown;
}

export interface ContextManagementEligibility {
  eligible: boolean;
  reason?: "disabled" | "non-interactive" | "unsupported-provider";
}

export function resolveContextManagementEligibility(
  ctx: PiExtensionContext | undefined,
  env: ContextManagementEnvironment = process.env,
): ContextManagementEligibility {
  if (isExplicitlyDisabled(env.PI_CONTEXT_MANAGEMENT_EXPERIMENTAL_MODE)) {
    return { eligible: false, reason: "disabled" };
  }

  // Headless print/JSON sessions are used by temporary workers and structured requests.
  // Restricting activation to the TUI keeps those contexts isolated.
  if (ctx?.mode !== "tui") {
    return { eligible: false, reason: "non-interactive" };
  }

  // `openai-codex` is Pi's subscription/OAuth route. `openai` and arbitrary
  // provider ids are API-key or custom-provider sessions and stay excluded.
  if (ctx.model?.provider !== "openai-codex" || ctx.model.api !== "openai-codex-responses") {
    return { eligible: false, reason: "unsupported-provider" };
  }

  return { eligible: true };
}

export function resolveReminderThreshold(env: ContextManagementEnvironment = process.env): number {
  const configured = Number.parseInt(env.PI_CONTEXT_MANAGEMENT_REMINDER_TOKENS ?? "", 10);
  return Number.isSafeInteger(configured) && configured > 0
    ? configured
    : DEFAULT_REMINDER_THRESHOLD_TOKENS;
}

export function buildContextWindowReminder(
  usage: PiContextUsage | undefined,
  thresholdTokens = DEFAULT_REMINDER_THRESHOLD_TOKENS,
): string | undefined {
  if (!usage || usage.tokens === null) {
    return undefined;
  }

  const remaining = Math.max(usage.contextWindow - usage.tokens, 0);
  if (remaining > thresholdTokens) {
    return undefined;
  }

  const urgency = remaining === 0 ? "is exhausted" : "is nearly exhausted";
  return `<context_window_reminder>\nYour current context window ${urgency}; only ${remaining} tokens remain. Before continuing substantial work, call new_context exactly once with a concise operational checkpoint in its note argument covering the goal, decisions, progress, learnings, next steps, and identifiers for unresolved requests. Record conclusions and evidence, never hidden chain-of-thought or opaque reasoning state. The next model request will contain only that plaintext checkpoint and messages created after the boundary.\n</context_window_reminder>`;
}

export function normalizeHistoryNote(note: string): string {
  const normalized = note.trim();
  if (normalized.length === 0) {
    throw new Error("History note must not be empty.");
  }
  if (normalized.length > MAX_HISTORY_NOTE_CHARS) {
    throw new Error(`History note exceeds the ${MAX_HISTORY_NOTE_CHARS}-character limit.`);
  }
  if (containsOpaqueReasoningState(normalized)) {
    throw new Error(
      "History note contains an opaque reasoning marker or ciphertext-like payload. Save conclusions and evidence only.",
    );
  }
  return normalized;
}

export function sliceAfterLatestHistoryNote<T extends ContextMessageLike>(messages: T[]): T[] {
  let boundary = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.customType === HISTORY_NOTE_CUSTOM_TYPE) {
      boundary = index;
      break;
    }
  }
  return boundary === -1 ? messages : messages.slice(boundary);
}

function isExplicitlyDisabled(value: string | undefined): boolean {
  return ["0", "false", "no", "off"].includes(value?.trim().toLowerCase() ?? "");
}

function containsOpaqueReasoningState(note: string): boolean {
  return (
    /(?:encrypted_content|opaque_reasoning|reasoning_ciphertext|<\/?analysis\b)/iu.test(note) ||
    /(?:[A-Za-z0-9+/]{512,}={0,2}|[A-Fa-f0-9]{1024,})/u.test(note)
  );
}
