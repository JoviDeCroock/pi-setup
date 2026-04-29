import { cleanMessage, truncate } from "./common.js";
import type { Diagnostic, DiagnosticSummary, FormatLimits, ParsedDiagnostics } from "./types.js";

export function formatDiagnostics(
  header: string,
  diagnostics: Diagnostic[],
  limits: FormatLimits,
  omittedLabel: string,
): string {
  const shown = diagnostics.slice(0, limits.maxDiagnostics);
  const lines = [header];

  for (const diagnostic of shown) {
    lines.push(formatDiagnostic(diagnostic, limits.maxMessageLength));
  }

  const omitted = diagnostics.length - shown.length;
  if (omitted > 0) {
    lines.push(`… ${omitted} more ${omittedLabel} omitted`);
  }

  return lines.join("\n");
}

export function formatProblemDiagnostics(
  profile: "lint" | "tsc",
  parsed: ParsedDiagnostics,
  limits: FormatLimits,
): string | undefined {
  if (parsed.diagnostics.length === 0 && !parsed.summary) {
    return undefined;
  }

  const summary = parsed.summary ?? summarizeDiagnostics(parsed.diagnostics);

  if (parsed.diagnostics.length === 0) {
    return `${profile}: ${formatSummary(summary)}`;
  }

  return formatDiagnostics(
    `${profile}: ${formatSummary(summary)}`,
    parsed.diagnostics,
    limits,
    "diagnostics",
  );
}

export function formatSummary(summary: DiagnosticSummary): string {
  const parts: string[] = [];
  if (summary.errors > 0) {
    parts.push(`${summary.errors} error${summary.errors === 1 ? "" : "s"}`);
  }
  if (summary.warnings > 0) {
    parts.push(`${summary.warnings} warning${summary.warnings === 1 ? "" : "s"}`);
  }
  return parts.length === 0 ? "ok" : parts.join(", ");
}

export function summarizeDiagnostics(diagnostics: Diagnostic[]): DiagnosticSummary {
  let errors = 0;
  let warnings = 0;

  for (const diagnostic of diagnostics) {
    if (diagnostic.severity === "warning") {
      warnings += 1;
    } else if (diagnostic.severity === "error") {
      errors += 1;
    }
  }

  return { errors, warnings };
}

function formatDiagnostic(diagnostic: Diagnostic, maxMessageLength: number): string {
  const location = diagnostic.file
    ? `${diagnostic.file}${diagnostic.line ? `:${diagnostic.line}` : ""}${diagnostic.column ? `:${diagnostic.column}` : ""}`
    : undefined;
  const code = diagnostic.code ? ` ${diagnostic.code}` : "";
  const message = truncate(cleanMessage(diagnostic.message), maxMessageLength);

  if (diagnostic.severity === "info") {
    return location ? `- ${location}: ${message}` : `- ${message}`;
  }

  return location
    ? `- ${location} ${diagnostic.severity}${code}: ${message}`
    : `- ${diagnostic.severity}${code}: ${message}`;
}
