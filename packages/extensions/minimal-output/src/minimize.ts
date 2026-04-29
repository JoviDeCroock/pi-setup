export type DiagnosticProfile = "lint" | "tsc";
export type DiagnosticSeverity = "error" | "warning";

export interface Diagnostic {
  code?: string | undefined;
  column?: number | undefined;
  file?: string | undefined;
  line?: number | undefined;
  message: string;
  severity: DiagnosticSeverity;
}

export interface MinimizeBashOutputOptions {
  maxDiagnostics?: number;
  maxMessageLength?: number;
}

export interface MinimizedOutput {
  diagnostics: Diagnostic[];
  omittedDiagnostics: number;
  originalLength: number;
  originalLineCount: number;
  profile: DiagnosticProfile;
  text: string;
}

export type MinimizeBashOutputDecision =
  | { reason: string; status: "unchanged" }
  | ({ status: "minimized" } & MinimizedOutput);

interface DiagnosticSummary {
  errors: number;
  warnings: number;
}

interface ParsedDiagnostics {
  diagnostics: Diagnostic[];
  summary?: DiagnosticSummary;
}

const ANSI_ESCAPE_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, "gu");
const DEFAULT_MAX_DIAGNOSTICS = 25;
const DEFAULT_MAX_MESSAGE_LENGTH = 180;

export function minimizeBashOutput(
  command: string,
  output: string,
  options: MinimizeBashOutputOptions = {},
): MinimizeBashOutputDecision {
  const profile = classifyDiagnosticCommand(command);
  if (!profile) {
    return { reason: "unsupported-command", status: "unchanged" };
  }

  const stripped = stripAnsi(output).trim();
  if (stripped.length === 0) {
    return { reason: "empty-output", status: "unchanged" };
  }

  const parsed = profile === "tsc" ? parseTscDiagnostics(stripped) : parseLintDiagnostics(stripped);
  const text = formatMinimalDiagnostics(profile, parsed, {
    maxDiagnostics: options.maxDiagnostics ?? DEFAULT_MAX_DIAGNOSTICS,
    maxMessageLength: options.maxMessageLength ?? DEFAULT_MAX_MESSAGE_LENGTH,
  });

  if (!text) {
    return { reason: "no-diagnostics", status: "unchanged" };
  }

  const diagnostics = parsed.diagnostics;
  const shown = Math.min(diagnostics.length, options.maxDiagnostics ?? DEFAULT_MAX_DIAGNOSTICS);

  return {
    diagnostics,
    omittedDiagnostics: Math.max(0, diagnostics.length - shown),
    originalLength: output.length,
    originalLineCount: splitLines(stripped).length,
    profile,
    status: "minimized",
    text,
  };
}

export function classifyDiagnosticCommand(command: string): DiagnosticProfile | undefined {
  const normalized = command
    .replace(/\\\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (
    /(?:^|[;&|()\s])(?:(?:pnpm|npm|yarn|bun|npx)\s+(?:(?:run|exec|dlx|x)\s+)?)?(?:vue-)?tsc\b/iu.test(
      normalized,
    ) ||
    /(?:^|[;&|()\s])(?:pnpm|npm|yarn|bun)\s+(?:run\s+)?type-?check\b/iu.test(normalized)
  ) {
    return "tsc";
  }

  if (
    /(?:^|[;&|()\s])(?:(?:pnpm|npm|yarn|bun|npx)\s+(?:(?:run|exec|dlx|x)\s+)?)?(?:eslint|oxlint|biome\s+lint)\b/iu.test(
      normalized,
    ) ||
    /(?:^|[;&|()\s])(?:pnpm|npm|yarn|bun)\s+(?:run\s+)?lint\b/iu.test(normalized)
  ) {
    return "lint";
  }

  return undefined;
}

export function parseTscDiagnostics(output: string): ParsedDiagnostics {
  const diagnostics: Diagnostic[] = [];
  let summary: DiagnosticSummary | undefined;

  for (const line of splitLines(output)) {
    const compact = line.match(/^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.+)$/iu);
    if (compact) {
      diagnostics.push({
        code: compact[5],
        column: Number(compact[3]),
        file: compact[1],
        line: Number(compact[2]),
        message: compact[6] ?? "",
        severity: compact[4]?.toLowerCase() === "warning" ? "warning" : "error",
      });
      continue;
    }

    const pretty = line.match(/^(.+?):(\d+):(\d+)\s+-\s+(error|warning)\s+(TS\d+):\s+(.+)$/iu);
    if (pretty) {
      diagnostics.push({
        code: pretty[5],
        column: Number(pretty[3]),
        file: pretty[1],
        line: Number(pretty[2]),
        message: pretty[6] ?? "",
        severity: pretty[4]?.toLowerCase() === "warning" ? "warning" : "error",
      });
      continue;
    }

    const global = line.match(/^(error|warning)\s+(TS\d+):\s+(.+)$/iu);
    if (global) {
      diagnostics.push({
        code: global[2],
        message: global[3] ?? "",
        severity: global[1]?.toLowerCase() === "warning" ? "warning" : "error",
      });
      continue;
    }

    const found = line.match(/Found\s+(\d+)\s+errors?\b/iu);
    if (found) {
      summary = { errors: Number(found[1]), warnings: 0 };
    }
  }

  return buildParsed(diagnostics, summary);
}

export function parseLintDiagnostics(output: string): ParsedDiagnostics {
  const diagnostics: Diagnostic[] = [];
  let currentFile: string | undefined;
  let pendingOxlint: Pick<Diagnostic, "code" | "message" | "severity"> | undefined;
  let summary: DiagnosticSummary | undefined;

  for (const rawLine of splitLines(output)) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    const eslintSummary = trimmed.match(
      /(?:✖|×)?\s*(\d+)\s+problems?\s+\((\d+)\s+errors?,\s+(\d+)\s+warnings?\)/iu,
    );
    if (eslintSummary) {
      summary = { errors: Number(eslintSummary[2]), warnings: Number(eslintSummary[3]) };
      continue;
    }

    const foundSummary = trimmed.match(
      /Found\s+(?:(\d+)\s+errors?)?(?:\s+and\s+)?(?:(\d+)\s+warnings?)?/iu,
    );
    if (foundSummary && (foundSummary[1] || foundSummary[2])) {
      summary = { errors: Number(foundSummary[1] ?? 0), warnings: Number(foundSummary[2] ?? 0) };
      continue;
    }

    const compact = trimmed.match(/^(.+?):(\d+):(\d+):\s+(error|warning)\s+(.+)$/iu);
    if (compact && looksLikePath(compact[1] ?? "")) {
      const parsed = splitLintMessage(compact[5] ?? "");
      diagnostics.push({
        code: parsed.rule,
        column: Number(compact[3]),
        file: compact[1],
        line: Number(compact[2]),
        message: parsed.message,
        severity: compact[4]?.toLowerCase() === "warning" ? "warning" : "error",
      });
      continue;
    }

    const stylish = line.match(/^\s*(\d+):(\d+)\s+(error|warning)\s+(.+)$/iu);
    if (stylish && currentFile) {
      const parsed = splitLintMessage(stylish[4] ?? "");
      diagnostics.push({
        code: parsed.rule,
        column: Number(stylish[2]),
        file: currentFile,
        line: Number(stylish[1]),
        message: parsed.message,
        severity: stylish[3]?.toLowerCase() === "warning" ? "warning" : "error",
      });
      continue;
    }

    const oxlintMessage = trimmed.match(/^[×✖]\s+[^:]+\(([^)]+)\):\s+(.+)$/iu);
    if (oxlintMessage) {
      pendingOxlint = {
        code: oxlintMessage[1],
        message: oxlintMessage[2] ?? "",
        severity: "error",
      };
      continue;
    }

    const oxlintLocation = trimmed.match(/[╭┌]-?\[(.+?):(\d+):(\d+)\]/u);
    if (oxlintLocation && pendingOxlint) {
      diagnostics.push({
        ...pendingOxlint,
        column: Number(oxlintLocation[3]),
        file: oxlintLocation[1],
        line: Number(oxlintLocation[2]),
      });
      pendingOxlint = undefined;
      continue;
    }

    if (trimmed && looksLikePath(trimmed) && !/\s/.test(trimmed)) {
      currentFile = trimmed;
    }
  }

  return buildParsed(diagnostics, summary);
}

function formatMinimalDiagnostics(
  profile: DiagnosticProfile,
  parsed: ParsedDiagnostics,
  options: Required<Pick<MinimizeBashOutputOptions, "maxDiagnostics" | "maxMessageLength">>,
): string | undefined {
  if (parsed.diagnostics.length === 0 && !parsed.summary) {
    return undefined;
  }

  const summary = parsed.summary ?? summarizeDiagnostics(parsed.diagnostics);

  if (parsed.diagnostics.length === 0) {
    return `${profile}: ${formatSummary(summary)}`;
  }

  const shown = parsed.diagnostics.slice(0, options.maxDiagnostics);
  const lines = [`${profile}: ${formatSummary(summary)}`];

  for (const diagnostic of shown) {
    lines.push(formatDiagnostic(diagnostic, options.maxMessageLength));
  }

  const omitted = parsed.diagnostics.length - shown.length;
  if (omitted > 0) {
    lines.push(`… ${omitted} more diagnostics omitted`);
  }

  return lines.join("\n");
}

function formatSummary(summary: DiagnosticSummary): string {
  const parts: string[] = [];
  if (summary.errors > 0) {
    parts.push(`${summary.errors} error${summary.errors === 1 ? "" : "s"}`);
  }
  if (summary.warnings > 0) {
    parts.push(`${summary.warnings} warning${summary.warnings === 1 ? "" : "s"}`);
  }
  return parts.length === 0 ? "ok" : parts.join(", ");
}

function formatDiagnostic(diagnostic: Diagnostic, maxMessageLength: number): string {
  const location = diagnostic.file
    ? `${diagnostic.file}${diagnostic.line ? `:${diagnostic.line}` : ""}${diagnostic.column ? `:${diagnostic.column}` : ""}`
    : "global";
  const code = diagnostic.code ? ` ${diagnostic.code}` : "";
  return `- ${location} ${diagnostic.severity}${code}: ${truncate(cleanMessage(diagnostic.message), maxMessageLength)}`;
}

function buildParsed(diagnostics: Diagnostic[], summary?: DiagnosticSummary): ParsedDiagnostics {
  if (summary) {
    return { diagnostics, summary };
  }
  return { diagnostics };
}

function summarizeDiagnostics(diagnostics: Diagnostic[]): DiagnosticSummary {
  let errors = 0;
  let warnings = 0;

  for (const diagnostic of diagnostics) {
    if (diagnostic.severity === "warning") {
      warnings += 1;
    } else {
      errors += 1;
    }
  }

  return { errors, warnings };
}

function splitLintMessage(input: string): { message: string; rule?: string } {
  const match = input.match(/^(.*?)\s+((?:@?[\w-]+\/)?[\w-]+(?:\/[\w-]+)?)$/u);
  if (!match) {
    return { message: input.trim() };
  }

  const maybeRule = match[2] ?? "";
  if (!maybeRule.includes("-") && !maybeRule.includes("/")) {
    return { message: input.trim() };
  }

  return { message: (match[1] ?? "").trim(), rule: maybeRule };
}

function cleanMessage(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function looksLikePath(input: string): boolean {
  return /(?:^\.|^\/|^~\/|\\|\/|\.[cm]?[jt]sx?$|\.vue$|\.svelte$|\.json$)/iu.test(input);
}

function splitLines(input: string): string[] {
  return input.replace(/\r\n/g, "\n").split("\n");
}

function stripAnsi(input: string): string {
  return input.replace(ANSI_ESCAPE_PATTERN, "");
}

function truncate(input: string, maxLength: number): string {
  if (input.length <= maxLength) {
    return input;
  }
  return `${input.slice(0, Math.max(0, maxLength - 1))}…`;
}
