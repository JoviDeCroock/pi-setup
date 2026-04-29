import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

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

export interface StructuredTestReporterDeferralOptions {
  cwd?: string | undefined;
  packageScripts?: Record<string, string> | undefined;
}

const REWRITE_EXIT_CODES = new Set([0, 3]);
const DEFAULT_TIMEOUT_MS = 1_000;
const SIMPLE_COMMAND_UNSAFE_PATTERN = /[\n;&|<>`]/u;

export function shouldDeferToStructuredTestReporter(
  command: string,
  options: StructuredTestReporterDeferralOptions = {},
): boolean {
  const trimmed = command.trim();
  if (trimmed.length === 0 || SIMPLE_COMMAND_UNSAFE_PATTERN.test(trimmed)) {
    return false;
  }

  const directRunner = detectStructuredReporterRunner(trimmed);
  if (directRunner) {
    return canUseStructuredReporter(trimmed, directRunner);
  }

  const packageScript = parsePackageTestScriptCommand(trimmed);
  if (!packageScript) {
    return false;
  }

  const scripts = options.packageScripts ?? loadNearestPackageScripts(options.cwd ?? process.cwd());
  const script = scripts?.[packageScript.scriptName];
  if (!script || SIMPLE_COMMAND_UNSAFE_PATTERN.test(script)) {
    return false;
  }

  const scriptRunner = detectStructuredReporterRunner(script);
  return scriptRunner ? canUseStructuredReporter(script, scriptRunner) : false;
}

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

function detectStructuredReporterRunner(command: string): "jest" | "vitest" | undefined {
  if (/(?:^|\s)(?:(?:pnpm|npm|yarn|bun|npx)\s+(?:(?:exec|dlx|x)\s+)?)?vitest\b/iu.test(command)) {
    return "vitest";
  }

  if (/(?:^|\s)(?:(?:pnpm|npm|yarn|bun|npx)\s+(?:(?:exec|dlx|x)\s+)?)?jest\b/iu.test(command)) {
    return "jest";
  }

  return undefined;
}

function canUseStructuredReporter(command: string, runner: "jest" | "vitest"): boolean {
  if (
    /--outputFile(?:=|\s)/u.test(command) ||
    /(?:^|\s)(?:--watch(?:All)?\b|--ui\b|watch\b)/iu.test(command)
  ) {
    return false;
  }

  if (runner === "vitest") {
    return /(?:^|\s)(?:run\b|--run\b)/iu.test(command) && !/--reporter(?:=|\s)/u.test(command);
  }

  return !/--json\b/u.test(command);
}

function parsePackageTestScriptCommand(command: string): { scriptName: string } | undefined {
  const match = command.match(
    /^(?:pnpm|npm|yarn|bun)\s+(?:(?:run|run-script)\s+)?(?:t|test(?::[\w.-]+)?)(?:\s*)$/iu,
  );
  if (!match) {
    return undefined;
  }

  const scriptName = command.trim().split(/\s+/u).at(-1);
  if (!scriptName) {
    return undefined;
  }

  return { scriptName: scriptName === "t" ? "test" : scriptName };
}

const packageScriptsCache = new Map<string, Record<string, string> | undefined>();

function loadNearestPackageScripts(cwd: string): Record<string, string> | undefined {
  const start = path.resolve(cwd);
  if (packageScriptsCache.has(start)) {
    return packageScriptsCache.get(start);
  }

  const scripts = findNearestPackageScripts(start);
  packageScriptsCache.set(start, scripts);
  return scripts;
}

function findNearestPackageScripts(start: string): Record<string, string> | undefined {
  let current = start;
  while (true) {
    const packageJsonPath = path.join(current, "package.json");
    if (existsSync(packageJsonPath)) {
      return readPackageScripts(packageJsonPath);
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

function readPackageScripts(packageJsonPath: string): Record<string, string> | undefined {
  try {
    const parsed = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { scripts?: unknown };
    if (
      typeof parsed.scripts !== "object" ||
      parsed.scripts === null ||
      Array.isArray(parsed.scripts)
    ) {
      return undefined;
    }

    return Object.fromEntries(
      Object.entries(parsed.scripts).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  } catch {
    return undefined;
  }
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
