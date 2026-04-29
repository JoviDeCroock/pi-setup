import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export type StructuredTestReporterKind = "jest" | "vitest";

export type RewriteTestCommandDecision =
  | { command: string; runner: StructuredTestReporterKind; status: "rewritten" }
  | { reason: string; status: "unchanged" };

export interface RewriteTestCommandOptions {
  cwd?: string | undefined;
  packageScripts?: Record<string, string> | undefined;
  summaryCliPath: string;
}

const SIMPLE_COMMAND_UNSAFE_PATTERN = /[\n;&|<>`]/u;
const TEST_REPORT_VARIABLE = "__pi_minimal_output_report";
const TEST_STATUS_VARIABLE = "__pi_minimal_output_status";

export function rewriteTestCommandWithStructuredReporter(
  command: string,
  options: RewriteTestCommandOptions,
): RewriteTestCommandDecision {
  const trimmed = command.trim();
  if (trimmed.length === 0) {
    return { reason: "empty-command", status: "unchanged" };
  }

  if (SIMPLE_COMMAND_UNSAFE_PATTERN.test(trimmed)) {
    return { reason: "complex-shell-command", status: "unchanged" };
  }

  const resolved = resolveStructuredReporterCommand(trimmed, options);
  if (resolved.status === "unchanged") {
    return resolved;
  }

  return {
    command: wrapCommandWithStructuredReport(
      resolved.command,
      resolved.reporterArgs,
      options.summaryCliPath,
      resolved.runner,
    ),
    runner: resolved.runner,
    status: "rewritten",
  };
}

type ResolvedStructuredReporterCommand =
  | {
      command: string;
      reporterArgs: string;
      runner: StructuredTestReporterKind;
      status: "resolved";
    }
  | { reason: string; status: "unchanged" };

function resolveStructuredReporterCommand(
  command: string,
  options: RewriteTestCommandOptions,
): ResolvedStructuredReporterCommand {
  const directRunner = detectStructuredReporterRunner(command);
  if (directRunner) {
    return resolveDirectRunnerCommand(command, directRunner);
  }

  const packageScript = parsePackageTestScriptCommand(command);
  if (!packageScript) {
    return { reason: "unsupported-test-runner", status: "unchanged" };
  }

  const scripts = options.packageScripts ?? loadNearestPackageScripts(options.cwd ?? process.cwd());
  const script = scripts?.[packageScript.scriptName];
  if (!script) {
    return { reason: "package-script-not-found", status: "unchanged" };
  }

  return resolvePackageScriptCommand(command, script);
}

function resolveDirectRunnerCommand(
  command: string,
  runner: StructuredTestReporterKind,
): ResolvedStructuredReporterCommand {
  const decision = validateRunnerCommand(command, runner);
  if (decision) {
    return decision;
  }

  return {
    command: `${command} ${reporterArgsFor(runner)}`,
    reporterArgs: "",
    runner,
    status: "resolved",
  };
}

function resolvePackageScriptCommand(
  command: string,
  script: string,
): ResolvedStructuredReporterCommand {
  if (SIMPLE_COMMAND_UNSAFE_PATTERN.test(script)) {
    return { reason: "complex-package-script", status: "unchanged" };
  }

  const runner = detectStructuredReporterRunner(script);
  if (!runner) {
    return { reason: "unsupported-package-script-runner", status: "unchanged" };
  }

  const commandDecision = validateRunnerCommand(command, runner, { requireVitestRunMode: false });
  if (commandDecision) {
    return commandDecision;
  }

  const scriptDecision = validateRunnerCommand(script, runner);
  if (scriptDecision) {
    return scriptDecision;
  }

  return {
    command,
    reporterArgs: `-- ${reporterArgsFor(runner)}`,
    runner,
    status: "resolved",
  };
}

function validateRunnerCommand(
  command: string,
  runner: StructuredTestReporterKind,
  options: { requireVitestRunMode?: boolean } = {},
): { reason: string; status: "unchanged" } | undefined {
  if (hasExistingStructuredReporter(command, runner)) {
    return { reason: "existing-reporter", status: "unchanged" };
  }

  if (isInteractiveOrWatchMode(command)) {
    return { reason: "interactive-or-watch-mode", status: "unchanged" };
  }

  if (runner === "vitest" && options.requireVitestRunMode !== false && !isVitestRunMode(command)) {
    return { reason: "vitest-watch-default", status: "unchanged" };
  }

  return undefined;
}

function detectStructuredReporterRunner(command: string): StructuredTestReporterKind | undefined {
  if (/(?:^|\s)(?:(?:pnpm|npm|yarn|bun|npx)\s+(?:(?:exec|dlx|x)\s+)?)?vitest\b/iu.test(command)) {
    return "vitest";
  }

  if (/(?:^|\s)(?:(?:pnpm|npm|yarn|bun|npx)\s+(?:(?:exec|dlx|x)\s+)?)?jest\b/iu.test(command)) {
    return "jest";
  }

  return undefined;
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

function hasExistingStructuredReporter(
  command: string,
  runner: StructuredTestReporterKind,
): boolean {
  if (/--outputFile(?:=|\s)/u.test(command)) {
    return true;
  }

  if (runner === "vitest") {
    return /--reporter(?:=|\s)/u.test(command);
  }

  return /--json\b/u.test(command);
}

function isInteractiveOrWatchMode(command: string): boolean {
  return /(?:^|\s)(?:--watch(?:All)?\b|--ui\b|watch\b)/iu.test(command);
}

function isVitestRunMode(command: string): boolean {
  return /(?:^|\s)(?:run\b|--run\b)/iu.test(command);
}

function reporterArgsFor(runner: StructuredTestReporterKind): string {
  if (runner === "vitest") {
    return `--reporter=json --outputFile="$${TEST_REPORT_VARIABLE}"`;
  }

  return `--json --outputFile="$${TEST_REPORT_VARIABLE}"`;
}

function wrapCommandWithStructuredReport(
  command: string,
  reporterArgs: string,
  summaryCliPath: string,
  runner: StructuredTestReporterKind,
): string {
  const quotedSummaryCliPath = shellSingleQuote(summaryCliPath);
  const quotedRunner = shellSingleQuote(runner);

  const commandWithReporterArgs = reporterArgs.length > 0 ? `${command} ${reporterArgs}` : command;

  return [
    `${TEST_REPORT_VARIABLE}="$(mktemp "\${TMPDIR:-/tmp}/pi-minimal-output-${runner}-XXXXXX")"`,
    commandWithReporterArgs,
    `${TEST_STATUS_VARIABLE}=$?`,
    `node ${quotedSummaryCliPath} --runner ${quotedRunner} "$${TEST_REPORT_VARIABLE}" || true`,
    `if [ "$${TEST_STATUS_VARIABLE}" -eq 0 ]; then rm -f "$${TEST_REPORT_VARIABLE}"; else echo "structured test report: $${TEST_REPORT_VARIABLE}"; fi`,
    `exit $${TEST_STATUS_VARIABLE}`,
  ].join("; ");
}

function shellSingleQuote(input: string): string {
  return `'${input.replaceAll("'", "'\\''")}'`;
}
