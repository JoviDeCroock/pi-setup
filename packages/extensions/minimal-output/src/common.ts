import type { Diagnostic, DiagnosticSeverity } from "./types.js";

const ANSI_ESCAPE_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, "gu");

export function cleanMessage(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

export function dedupeDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
  const seen = new Set<string>();
  const deduped: Diagnostic[] = [];

  for (const diagnostic of diagnostics) {
    const key = [
      diagnostic.severity,
      diagnostic.file,
      diagnostic.line,
      diagnostic.column,
      diagnostic.code,
      diagnostic.message,
    ].join("\0");
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(diagnostic);
    }
  }

  return deduped;
}

export function fallbackSignificantDiagnostics(
  output: string,
  severity: Exclude<DiagnosticSeverity, "info">,
  options: { shouldIgnoreLine?: (line: string) => boolean } = {},
): Diagnostic[] {
  return dedupeDiagnostics(
    splitLines(output)
      .map((line) => cleanMessage(line))
      .filter((line) => line.length > 0)
      .filter((line) => !options.shouldIgnoreLine?.(line))
      .filter((line) =>
        /(?:\b(?:error|failed|failure|fatal|warn(?:ing)?)\b|ERR!|ERR_PNPM|✘|×)/iu.test(line),
      )
      .map((line) => ({ message: line, severity })),
  );
}

export function isWorthReplacing(minimized: string, original: string): boolean {
  if (minimized.length < original.length) {
    return true;
  }

  const originalLineCount = splitLines(original).length;
  const minimizedLineCount = splitLines(minimized).length;
  return minimizedLineCount <= Math.max(1, Math.floor(originalLineCount * 0.6));
}

export function looksLikePath(input: string): boolean {
  return /(?:^\.|^\/|^~\/|\\|\/|\.[cm]?[jt]sx?$|\.vue$|\.svelte$|\.json$|\.py$|\.go$|\.rs$)/iu.test(
    input,
  );
}

export function parseLocationFromLine(input: string):
  | {
      column?: number | undefined;
      file?: string | undefined;
      line?: number | undefined;
      message?: string | undefined;
    }
  | undefined {
  const bracket = input.match(/[╭┌]-?\[(.+?):(\d+):(\d+)\]/u);
  if (bracket) {
    return { column: Number(bracket[3]), file: bracket[1], line: Number(bracket[2]) };
  }

  const stackInParens = input.match(/\((.+?):(\d+):(\d+)\)/u);
  if (stackInParens && looksLikePath(stackInParens[1] ?? "")) {
    return {
      column: Number(stackInParens[3]),
      file: stackInParens[1],
      line: Number(stackInParens[2]),
    };
  }

  const stack = input.match(/(?:at\s+|❯\s*)?(.*?):(\d+):(\d+)(?:\)|\s|$)/u);
  if (stack && looksLikePath(stack[1] ?? "")) {
    return { column: Number(stack[3]), file: stack[1], line: Number(stack[2]) };
  }

  const compact = input.match(
    /^(.+?):(\d+):(\d+):\s*(?:(ERROR|Error|error|WARNING|Warning|warning):?\s*)?(.+)$/u,
  );
  if (compact && looksLikePath(compact[1] ?? "")) {
    return {
      column: Number(compact[3]),
      file: compact[1],
      line: Number(compact[2]),
      message: compact[5],
    };
  }

  const paren = input.match(/^(.+?)\((\d+),(\d+)\):\s*(.+)$/u);
  if (paren && looksLikePath(paren[1] ?? "")) {
    return {
      column: Number(paren[3]),
      file: paren[1],
      line: Number(paren[2]),
      message: paren[4],
    };
  }

  const errorIn = input.match(/^ERROR in (.+)$/iu);
  if (errorIn) {
    return { file: errorIn[1], message: `ERROR in ${errorIn[1] ?? "module"}` };
  }

  return undefined;
}

export function splitLines(input: string): string[] {
  return input.replace(/\r\n/g, "\n").split("\n");
}

export function stripAnsi(input: string): string {
  return input.replace(ANSI_ESCAPE_PATTERN, "");
}

export function truncate(input: string, maxLength: number): string {
  if (input.length <= maxLength) {
    return input;
  }
  return `${input.slice(0, Math.max(0, maxLength - 1))}…`;
}
