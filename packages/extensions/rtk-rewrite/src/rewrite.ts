import { runCommand, type RunCommandOptions, type RunCommandResult } from "@pi-setup/shared";

export type RtkRewriteStatus = "failed" | "rewritten" | "unchanged" | "unavailable";

export interface RtkRewriteDecision {
  command: string;
  exitCode?: number;
  originalCommand: string;
  reason?: string;
  stderr?: string;
  status: RtkRewriteStatus;
}

export type RtkCommandRunner = (
  command: string,
  args: string[],
  options: RunCommandOptions,
) => Promise<RunCommandResult>;

export interface RtkRewriteOptions {
  cwd?: string;
  runner?: RtkCommandRunner;
  signal?: AbortSignal;
  timeoutMs?: number;
}

const REWRITE_EXIT_CODES = new Set([0, 3]);
const DEFAULT_TIMEOUT_MS = 1_000;

export async function rewriteCommandWithRtk(
  originalCommand: string,
  options: RtkRewriteOptions = {},
): Promise<RtkRewriteDecision> {
  if (originalCommand.trim().length === 0) {
    return unchangedDecision(originalCommand, "empty-command");
  }

  const runner = options.runner ?? runCommand;
  const runOptions: RunCommandOptions = {
    allowFailure: true,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  };

  if (options.cwd) {
    runOptions.cwd = options.cwd;
  }

  if (options.signal) {
    runOptions.signal = options.signal;
  }

  try {
    const result = await runner("rtk", ["rewrite", originalCommand], runOptions);
    return interpretRtkRewriteResult(originalCommand, result);
  } catch (error) {
    return {
      command: originalCommand,
      originalCommand,
      reason: error instanceof Error ? error.message : "rtk rewrite threw an unknown error",
      status: "failed",
    };
  }
}

export function interpretRtkRewriteResult(
  originalCommand: string,
  result: RunCommandResult,
): RtkRewriteDecision {
  const rewrittenCommand = result.stdout.trim();

  if (isRtkUnavailable(result)) {
    return {
      command: originalCommand,
      exitCode: result.exitCode,
      originalCommand,
      reason: "rtk-not-on-path",
      stderr: result.stderr,
      status: "unavailable",
    };
  }

  if (REWRITE_EXIT_CODES.has(result.exitCode) && rewrittenCommand.length > 0) {
    if (rewrittenCommand === originalCommand) {
      return unchangedDecision(originalCommand, "same-command", result);
    }

    return {
      command: rewrittenCommand,
      exitCode: result.exitCode,
      originalCommand,
      stderr: result.stderr,
      status: "rewritten",
    };
  }

  if (result.exitCode === 1 && rewrittenCommand.length === 0) {
    return unchangedDecision(originalCommand, "no-rtk-equivalent", result);
  }

  return {
    command: originalCommand,
    exitCode: result.exitCode,
    originalCommand,
    reason: result.stderr || "rtk rewrite did not return a usable command",
    stderr: result.stderr,
    status: "failed",
  };
}

function unchangedDecision(
  originalCommand: string,
  reason: string,
  result?: RunCommandResult,
): RtkRewriteDecision {
  const decision: RtkRewriteDecision = {
    command: originalCommand,
    originalCommand,
    reason,
    status: "unchanged",
  };

  if (result) {
    decision.exitCode = result.exitCode;
    decision.stderr = result.stderr;
  }

  return decision;
}

function isRtkUnavailable(result: RunCommandResult): boolean {
  return /\bENOENT\b|not recognized|not found|command not found|No such file or directory/iu.test(
    result.stderr,
  );
}
