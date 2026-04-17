import type { PiExtensionContext, PiSessionEntryLike } from "@pi-setup/pi-kit";
import { getModelId } from "@pi-setup/pi-kit";
import { parseJsonLines } from "@pi-setup/shared";

export interface UsagePoint {
  contextTokens?: number;
  model?: string;
  timestamp: string;
  toolNames: string[];
  turnIndex: number;
}

export interface UsageSummary {
  averageToolsPerTurn: number;
  firstTimestamp?: string;
  lastModel?: string;
  lastTimestamp?: string;
  peakContextTokens?: number;
  toolBreakdown: Array<{ count: number; name: string }>;
  totalToolCalls: number;
  totalTurns: number;
}

export function summarizeUsage(points: UsagePoint[]): UsageSummary {
  const toolCounts = new Map<string, number>();

  for (const point of points) {
    for (const toolName of point.toolNames) {
      toolCounts.set(toolName, (toolCounts.get(toolName) ?? 0) + 1);
    }
  }

  const toolBreakdown = Array.from(toolCounts.entries())
    .map(([name, count]) => ({ count, name }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));

  const totalToolCalls = points.reduce((total, point) => total + point.toolNames.length, 0);
  const contextValues = points
    .map((point) => point.contextTokens)
    .filter((value): value is number => typeof value === "number");
  const firstTimestamp = points[0]?.timestamp;
  const lastTimestamp = points.at(-1)?.timestamp;
  const lastModel = points.at(-1)?.model;

  return {
    averageToolsPerTurn: points.length === 0 ? 0 : totalToolCalls / points.length,
    ...(firstTimestamp ? { firstTimestamp } : {}),
    ...(lastModel ? { lastModel } : {}),
    ...(lastTimestamp ? { lastTimestamp } : {}),
    ...(contextValues.length > 0 ? { peakContextTokens: Math.max(...contextValues) } : {}),
    toolBreakdown,
    totalToolCalls,
    totalTurns: points.length,
  };
}

export function formatUsageSummary(summary: UsageSummary): string {
  const lines = [
    "# Usage Insights",
    "",
    `Turns: ${summary.totalTurns}`,
    `Tool calls: ${summary.totalToolCalls}`,
    `Average tools per turn: ${summary.averageToolsPerTurn.toFixed(2)}`,
  ];

  if (summary.lastModel) {
    lines.push(`Last model: ${summary.lastModel}`);
  }

  if (summary.peakContextTokens !== undefined) {
    lines.push(`Peak context tokens: ${summary.peakContextTokens}`);
  }

  if (summary.firstTimestamp && summary.lastTimestamp) {
    lines.push(`Window: ${summary.firstTimestamp} -> ${summary.lastTimestamp}`);
  }

  if (summary.toolBreakdown.length > 0) {
    lines.push("", "## Tool breakdown", "");
    lines.push(...summary.toolBreakdown.map((item) => `- \`${item.name}\`: ${item.count}`));
  }

  return lines.join("\n");
}

export function extractUsagePointFromTurnEnd(
  event: unknown,
  ctx: PiExtensionContext | undefined,
): UsagePoint {
  const eventRecord = asRecord(event);
  const rawToolResults = Array.isArray(eventRecord?.toolResults) ? eventRecord.toolResults : [];
  const contextUsage =
    typeof ctx?.getContextUsage === "function" ? ctx.getContextUsage() : undefined;
  const contextTokens = extractNumber(contextUsage, [
    "contextTokens",
    "inputTokens",
    "tokens",
    "totalTokens",
  ]);
  const model = getModelId(ctx);

  return {
    ...(contextTokens !== undefined ? { contextTokens } : {}),
    ...(model ? { model } : {}),
    timestamp: new Date().toISOString(),
    toolNames: rawToolResults.flatMap((result) => {
      const record = asRecord(result);
      const candidate =
        typeof record?.toolName === "string"
          ? record.toolName
          : typeof record?.name === "string"
            ? record.name
            : undefined;
      return candidate ? [candidate] : [];
    }),
    turnIndex: extractNumber(eventRecord, ["turnIndex"]) ?? 0,
  };
}

export function usagePointFromSessionEntry(entry: unknown): UsagePoint | undefined {
  const record = asRecord(entry);
  if (!record) {
    return undefined;
  }

  const directPoint = usagePointFromUnknown(record);
  if (directPoint) {
    return directPoint;
  }

  if (record.type === "custom" && record.customType === "usage-insights") {
    return usagePointFromUnknown(record.data);
  }

  return undefined;
}

export function usagePointsFromEntries(entries: PiSessionEntryLike[]): UsagePoint[] {
  return entries
    .map((entry) => usagePointFromSessionEntry(entry))
    .filter((point): point is UsagePoint => point !== undefined);
}

export function usagePointsFromJsonl(input: string): UsagePoint[] {
  return parseJsonLines<unknown>(input)
    .map((line) => usagePointFromSessionEntry(line.value))
    .filter((point): point is UsagePoint => point !== undefined);
}

function usagePointFromUnknown(value: unknown): UsagePoint | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  const timestamp = typeof record.timestamp === "string" ? record.timestamp : undefined;
  const turnIndex = extractNumber(record, ["turnIndex"]);
  const rawToolNames = Array.isArray(record.toolNames) ? record.toolNames : [];

  if (!timestamp || turnIndex === undefined) {
    return undefined;
  }

  const contextTokens = extractNumber(record, ["contextTokens"]);
  const model = typeof record.model === "string" ? record.model : undefined;

  return {
    ...(contextTokens !== undefined ? { contextTokens } : {}),
    ...(model ? { model } : {}),
    timestamp,
    toolNames: rawToolNames.filter((toolName): toolName is string => typeof toolName === "string"),
    turnIndex,
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function extractNumber(value: unknown, keys: string[]): number | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === "number") {
      return candidate;
    }
  }

  return undefined;
}
