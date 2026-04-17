import type { PiExtensionContext, PiToolExecutionArgs } from "./documented-pi.js";

export function normalizeToolExecutionArgs<TParameters>(
  rawArgs: unknown[],
): PiToolExecutionArgs<TParameters> {
  const [toolCallId, params, ...remainder] = rawArgs;
  let ctx: PiExtensionContext | undefined;
  let onUpdate: ((...args: unknown[]) => void) | undefined;
  let signal: AbortSignal | undefined;

  for (const value of remainder) {
    if (!signal && isAbortSignal(value)) {
      signal = value;
      continue;
    }

    if (!onUpdate && typeof value === "function") {
      onUpdate = value as (...args: unknown[]) => void;
      continue;
    }

    if (!ctx && isPiExtensionContext(value)) {
      ctx = value;
    }
  }

  return {
    ctx,
    onUpdate,
    params: params as TParameters,
    rawArgs,
    signal,
    toolCallId: typeof toolCallId === "string" ? toolCallId : undefined,
  };
}

function isAbortSignal(value: unknown): value is AbortSignal {
  return (
    typeof value === "object" && value !== null && "aborted" in value && "addEventListener" in value
  );
}

function isPiExtensionContext(value: unknown): value is PiExtensionContext {
  return typeof value === "object" && value !== null && "cwd" in value;
}
