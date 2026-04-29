import { splitLines } from "./common.js";
import type { DiagnosticProfile, MinimizedOutput } from "./types.js";

export const MINIMAL_OUTPUT_SAVINGS_ENTRY_TYPE = "minimal-output-savings";
const APPROX_CHARS_PER_TOKEN = 4;

export interface MinimalOutputSavingsPoint {
  command: string;
  diagnostics: number;
  estimatedTokensSaved: number;
  minimizedLength: number;
  minimizedLineCount: number;
  omittedDiagnostics: number;
  originalLength: number;
  originalLineCount: number;
  profile: DiagnosticProfile;
  savedLength: number;
  savedLineCount: number;
  timestamp: string;
}

export interface MinimalOutputSavingsSummary {
  byProfile: Partial<Record<DiagnosticProfile, MinimalOutputSavingsTotals>>;
  estimatedTokensSaved: number;
  pointCount: number;
  totalMinimizedLength: number;
  totalMinimizedLineCount: number;
  totalOriginalLength: number;
  totalOriginalLineCount: number;
  totalSavedLength: number;
  totalSavedLineCount: number;
}

export interface MinimalOutputSavingsTotals {
  estimatedTokensSaved: number;
  pointCount: number;
  totalMinimizedLength: number;
  totalMinimizedLineCount: number;
  totalOriginalLength: number;
  totalOriginalLineCount: number;
  totalSavedLength: number;
  totalSavedLineCount: number;
}

export function createSavingsPoint(
  command: string,
  minimized: MinimizedOutput,
  timestamp = new Date().toISOString(),
): MinimalOutputSavingsPoint {
  const minimizedLength = minimized.text.length;
  const minimizedLineCount = splitLines(minimized.text).length;
  const savedLength = Math.max(0, minimized.originalLength - minimizedLength);
  const savedLineCount = Math.max(0, minimized.originalLineCount - minimizedLineCount);

  return {
    command: previewCommand(command),
    diagnostics: minimized.diagnostics.length,
    estimatedTokensSaved: estimateTokens(savedLength),
    minimizedLength,
    minimizedLineCount,
    omittedDiagnostics: minimized.omittedDiagnostics,
    originalLength: minimized.originalLength,
    originalLineCount: minimized.originalLineCount,
    profile: minimized.profile,
    savedLength,
    savedLineCount,
    timestamp,
  };
}

export function savingsPointsFromEntries(
  entries: Array<{ customType?: string; data?: unknown }>,
): MinimalOutputSavingsPoint[] {
  return entries
    .filter((entry) => entry.customType === MINIMAL_OUTPUT_SAVINGS_ENTRY_TYPE)
    .map((entry) => parseSavingsPoint(entry.data))
    .filter((point): point is MinimalOutputSavingsPoint => point !== undefined);
}

export function summarizeSavings(
  points: readonly MinimalOutputSavingsPoint[],
): MinimalOutputSavingsSummary {
  const summary: MinimalOutputSavingsSummary = {
    byProfile: {},
    estimatedTokensSaved: 0,
    pointCount: 0,
    totalMinimizedLength: 0,
    totalMinimizedLineCount: 0,
    totalOriginalLength: 0,
    totalOriginalLineCount: 0,
    totalSavedLength: 0,
    totalSavedLineCount: 0,
  };

  for (const point of points) {
    addPointToTotals(summary, point);
    const profileTotals = (summary.byProfile[point.profile] ??= emptyTotals());
    addPointToTotals(profileTotals, point);
  }

  return summary;
}

export function formatSavingsSummary(summary: MinimalOutputSavingsSummary): string {
  if (summary.pointCount === 0) {
    return "minimal-output has not compacted any Bash results in this session yet.";
  }

  const lines = [
    `minimal-output savings: ${summary.pointCount} compacted Bash result${summary.pointCount === 1 ? "" : "s"}`,
    `chars: ${formatNumber(summary.totalOriginalLength)} -> ${formatNumber(summary.totalMinimizedLength)} (${formatNumber(summary.totalSavedLength)} saved, ${formatPercent(summary.totalSavedLength, summary.totalOriginalLength)})`,
    `lines: ${formatNumber(summary.totalOriginalLineCount)} -> ${formatNumber(summary.totalMinimizedLineCount)} (${formatNumber(summary.totalSavedLineCount)} saved, ${formatPercent(summary.totalSavedLineCount, summary.totalOriginalLineCount)})`,
    `estimated tokens saved: ~${formatNumber(summary.estimatedTokensSaved)} (rough, chars/4)`,
  ];

  const profileLines = Object.entries(summary.byProfile)
    .sort(([, left], [, right]) => right.totalSavedLength - left.totalSavedLength)
    .map(
      ([profile, totals]) =>
        `- ${profile}: ${totals.pointCount} result${totals.pointCount === 1 ? "" : "s"}, ${formatNumber(totals.totalSavedLength)} chars saved (${formatPercent(totals.totalSavedLength, totals.totalOriginalLength)}), ~${formatNumber(totals.estimatedTokensSaved)} tokens`,
    );

  if (profileLines.length > 0) {
    lines.push("by profile:", ...profileLines);
  }

  return lines.join("\n");
}

function addPointToTotals(
  totals: MinimalOutputSavingsSummary | MinimalOutputSavingsTotals,
  point: MinimalOutputSavingsPoint,
): void {
  totals.estimatedTokensSaved += point.estimatedTokensSaved;
  totals.pointCount += 1;
  totals.totalMinimizedLength += point.minimizedLength;
  totals.totalMinimizedLineCount += point.minimizedLineCount;
  totals.totalOriginalLength += point.originalLength;
  totals.totalOriginalLineCount += point.originalLineCount;
  totals.totalSavedLength += point.savedLength;
  totals.totalSavedLineCount += point.savedLineCount;
}

function emptyTotals(): MinimalOutputSavingsTotals {
  return {
    estimatedTokensSaved: 0,
    pointCount: 0,
    totalMinimizedLength: 0,
    totalMinimizedLineCount: 0,
    totalOriginalLength: 0,
    totalOriginalLineCount: 0,
    totalSavedLength: 0,
    totalSavedLineCount: 0,
  };
}

function parseSavingsPoint(value: unknown): MinimalOutputSavingsPoint | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const candidate = value as Partial<MinimalOutputSavingsPoint>;
  if (
    typeof candidate.profile !== "string" ||
    typeof candidate.originalLength !== "number" ||
    typeof candidate.minimizedLength !== "number" ||
    typeof candidate.savedLength !== "number"
  ) {
    return undefined;
  }

  return {
    command: typeof candidate.command === "string" ? candidate.command : "",
    diagnostics: numberOrZero(candidate.diagnostics),
    estimatedTokensSaved: numberOrZero(candidate.estimatedTokensSaved),
    minimizedLength: numberOrZero(candidate.minimizedLength),
    minimizedLineCount: numberOrZero(candidate.minimizedLineCount),
    omittedDiagnostics: numberOrZero(candidate.omittedDiagnostics),
    originalLength: numberOrZero(candidate.originalLength),
    originalLineCount: numberOrZero(candidate.originalLineCount),
    profile: candidate.profile as DiagnosticProfile,
    savedLength: numberOrZero(candidate.savedLength),
    savedLineCount: numberOrZero(candidate.savedLineCount),
    timestamp: typeof candidate.timestamp === "string" ? candidate.timestamp : "",
  };
}

function estimateTokens(savedLength: number): number {
  return Math.max(0, Math.round(savedLength / APPROX_CHARS_PER_TOKEN));
}

function previewCommand(command: string): string {
  const normalized = command.replace(/\s+/gu, " ").trim();
  return normalized.length > 160 ? `${normalized.slice(0, 159)}…` : normalized;
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function formatNumber(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

function formatPercent(saved: number, original: number): string {
  if (original <= 0) {
    return "0.0%";
  }
  return `${((saved / original) * 100).toFixed(1)}%`;
}
