import {
  cleanMessage,
  dedupeDiagnostics,
  fallbackSignificantDiagnostics,
  splitLines,
} from "../common.js";
import { formatDiagnostics } from "../format.js";
import type {
  Diagnostic,
  FormatLimits,
  MinimizeBashOutputOptions,
  ProfileMinimization,
} from "../types.js";

export function minimizePackageManagerOutput(
  output: string,
  limits: FormatLimits,
  options: MinimizeBashOutputOptions,
): ProfileMinimization | undefined {
  const diagnostics = parsePackageManagerDiagnostics(output);
  const fallbackDiagnostics =
    diagnostics.length === 0 && options.isError
      ? fallbackSignificantDiagnostics(output, "error", {
          shouldIgnoreLine: isPackageManagerNoiseLine,
        })
      : [];
  const issues = diagnostics.length > 0 ? diagnostics : fallbackDiagnostics;

  if (issues.length === 0) {
    return undefined;
  }

  const errors = issues.filter((diagnostic) => diagnostic.severity === "error").length;
  const warnings = issues.filter((diagnostic) => diagnostic.severity === "warning").length;
  const parts = [options.isError || errors > 0 ? "failed" : "ok"];

  if (errors > 0) {
    parts.push(`${errors} error${errors === 1 ? "" : "s"}`);
  }
  if (warnings > 0) {
    parts.push(`${warnings} warning${warnings === 1 ? "" : "s"}`);
  }

  return {
    diagnostics: issues,
    text: formatDiagnostics(`pkg: ${parts.join(", ")}`, issues, limits, "items"),
  };
}

export function parsePackageManagerDiagnostics(output: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const infoMessages = new Set<string>();

  for (const rawLine of splitLines(output)) {
    const trimmed = cleanupPackageManagerLine(rawLine.trim());
    if (trimmed.length === 0 || isPackageManagerNoiseLine(trimmed)) {
      continue;
    }

    if (isPackageManagerErrorLine(trimmed)) {
      diagnostics.push({ message: trimmed, severity: "error" });
      continue;
    }

    if (isPackageManagerWarningLine(trimmed)) {
      diagnostics.push({ message: trimmed, severity: "warning" });
      continue;
    }

    if (isPackageManagerSummaryLine(trimmed) && !infoMessages.has(trimmed)) {
      infoMessages.add(trimmed);
      diagnostics.push({ message: trimmed, severity: "info" });
    }
  }

  return dedupeDiagnostics(diagnostics);
}

function cleanupPackageManagerLine(input: string): string {
  return cleanMessage(input.replace(/^[\u2009\s]+/u, "").replace(/^[>➤]\s*/u, ""));
}

function isPackageManagerErrorLine(input: string): boolean {
  return /(?:ERR!|ERR_PNPM[\w-]*|\b(?:ERROR|ERESOLVE|ELIFECYCLE|ENOENT|EACCES|EPERM)\b|\berror\b)/iu.test(
    input,
  );
}

function isPackageManagerWarningLine(input: string): boolean {
  return /(?:\bWARN(?:ING)?\b|\bdeprecated\b|peer dep|unmet peer|YN\d{4})/iu.test(input);
}

function isPackageManagerSummaryLine(input: string): boolean {
  return /^(?:Packages:\s+[+-]|(?:added|removed|changed|audited)\s+\d+\s+packages?|\d+\s+packages?\s+installed|Done in \d|found \d+ vulnerabilities?|up to date|\+\s+[^\s]+@|[-+]\s+[^\s]+@)/iu.test(
    input,
  );
}

function isPackageManagerNoiseLine(input: string): boolean {
  return /^(?:Progress:|Resolving:|Resolved |Downloaded |Packages are hard linked|Lockfile is up to date|Already up to date|Run `npm fund`|npm notice|added \d+ packages? from \d+ contributors)/iu.test(
    input,
  );
}
