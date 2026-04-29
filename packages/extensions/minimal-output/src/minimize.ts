import { classifyDiagnosticCommand } from "./classify.js";
import { isWorthReplacing, splitLines, stripAnsi } from "./common.js";
import { formatProblemDiagnostics } from "./format.js";
import { minimizeBuildOutput } from "./profiles/build.js";
import { parseLintDiagnostics } from "./profiles/lint.js";
import { minimizePackageManagerOutput } from "./profiles/package-manager.js";
import { minimizeTestOutput } from "./profiles/runners.js";
import { parseTscDiagnostics } from "./profiles/tsc.js";
import type {
  DiagnosticProfile,
  FormatLimits,
  MinimizeBashOutputDecision,
  MinimizeBashOutputOptions,
  ProfileMinimization,
} from "./types.js";

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

  const limits: FormatLimits = {
    maxDiagnostics: options.maxDiagnostics ?? DEFAULT_MAX_DIAGNOSTICS,
    maxMessageLength: options.maxMessageLength ?? DEFAULT_MAX_MESSAGE_LENGTH,
  };

  const minimized = minimizeByProfile(profile, stripped, limits, options);
  if (!minimized) {
    return { reason: "no-diagnostics", status: "unchanged" };
  }

  if (!isWorthReplacing(minimized.text, stripped)) {
    return { reason: "not-smaller", status: "unchanged" };
  }

  const shown = Math.min(minimized.diagnostics.length, limits.maxDiagnostics);

  return {
    diagnostics: minimized.diagnostics,
    omittedDiagnostics: Math.max(0, minimized.diagnostics.length - shown),
    originalLength: output.length,
    originalLineCount: splitLines(stripped).length,
    profile,
    status: "minimized",
    text: minimized.text,
  };
}

function minimizeByProfile(
  profile: DiagnosticProfile,
  output: string,
  limits: FormatLimits,
  options: MinimizeBashOutputOptions,
): ProfileMinimization | undefined {
  if (profile === "tsc") {
    const parsed = parseTscDiagnostics(output);
    const text = formatProblemDiagnostics("tsc", parsed, limits);
    return text ? { diagnostics: parsed.diagnostics, text } : undefined;
  }

  if (profile === "lint") {
    const parsed = parseLintDiagnostics(output);
    const text = formatProblemDiagnostics("lint", parsed, limits);
    return text ? { diagnostics: parsed.diagnostics, text } : undefined;
  }

  if (profile === "test") {
    return minimizeTestOutput(output, limits, options);
  }

  if (profile === "build") {
    return minimizeBuildOutput(output, limits, options);
  }

  return minimizePackageManagerOutput(output, limits, options);
}

export { classifyDiagnosticCommand } from "./classify.js";
export { parseLintDiagnostics } from "./profiles/lint.js";
export { parseTscDiagnostics } from "./profiles/tsc.js";
export * from "./types.js";
