import { cleanupBuildLine, isBuildNoiseLine, parseBuildLocation } from "./build-helpers.js";
import {
  dedupeDiagnostics,
  fallbackSignificantDiagnostics,
  looksLikePath,
  splitLines,
} from "../common.js";
import { formatDiagnostics } from "../format.js";
import type {
  Diagnostic,
  FormatLimits,
  MinimizeBashOutputOptions,
  ProfileMinimization,
} from "../types.js";

export function minimizeBuildOutput(
  output: string,
  limits: FormatLimits,
  options: MinimizeBashOutputOptions,
): ProfileMinimization | undefined {
  const diagnostics = parseBuildDiagnostics(output);
  const fallbackDiagnostics =
    diagnostics.length === 0 && options.isError
      ? fallbackSignificantDiagnostics(output, "error", { shouldIgnoreLine: isBuildNoiseLine })
      : [];
  const issues = diagnostics.length > 0 ? diagnostics : fallbackDiagnostics;
  const success = findBuildSuccessLine(output);

  if (issues.length === 0 && !success) {
    return undefined;
  }

  const errors = issues.filter((diagnostic) => diagnostic.severity === "error").length;
  const warnings = issues.filter((diagnostic) => diagnostic.severity === "warning").length;
  const status =
    options.isError || errors > 0 ? "failed" : warnings > 0 ? `${warnings} warnings` : "ok";
  const diagnosticsWithSuccess =
    issues.length > 0 || !success ? issues : [{ message: success, severity: "info" as const }];

  return {
    diagnostics: diagnosticsWithSuccess,
    text: formatDiagnostics(`build: ${status}`, diagnosticsWithSuccess, limits, "items"),
  };
}

export function parseBuildDiagnostics(output: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  let previousPath: string | undefined;

  for (const rawLine of splitLines(output)) {
    const trimmed = rawLine.trim();
    if (trimmed.length === 0 || isBuildNoiseLine(trimmed)) {
      continue;
    }

    if (looksLikePath(trimmed) && !/\s/.test(trimmed)) {
      previousPath = trimmed;
      continue;
    }

    const typeError = trimmed.match(/^Type error:\s+(.+)$/iu);
    if (typeError && previousPath) {
      diagnostics.push({
        file: previousPath,
        message: typeError[1] ?? "Type error",
        severity: "error",
      });
      continue;
    }

    const warningLine = /\bwarn(?:ing)?\b/iu.test(trimmed);
    const errorLine =
      /(?:\b(?:error|failed|failure|fatal)\b|module not found|cannot find|can't resolve|could not resolve|rolluperror|build failed|✘)/iu.test(
        trimmed,
      );

    if (!warningLine && !errorLine) {
      continue;
    }

    const location = parseBuildLocation(trimmed);
    diagnostics.push({
      ...location,
      message: location?.message ?? cleanupBuildLine(trimmed),
      severity: errorLine ? "error" : "warning",
    });
  }

  return dedupeDiagnostics(diagnostics);
}

function findBuildSuccessLine(output: string): string | undefined {
  return splitLines(output)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .find((line) =>
      /(?:✓\s*built in|compiled successfully|build completed|done in \d|built successfully)/iu.test(
        line,
      ),
    );
}
