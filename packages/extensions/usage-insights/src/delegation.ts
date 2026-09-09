import type { PiSessionEntryLike } from "@pi-setup/pi-kit";
import { parseJsonLines } from "@pi-setup/shared";

/**
 * Delegation tracking answers one question: does the orchestrator actually hand work to the
 * subagent tiers the global AGENTS.md asks for? It records each `subagent` tool call that
 * dispatches work (single-task or task-list forms) and ignores list/status style actions.
 *
 * The `subagent` tool comes from the third-party `pi-subagents` package, so the input shape is a
 * documented assumption (see docs/pi-assumptions.md) and parsing stays tolerant.
 */

export const DELEGATION_ENTRY_TYPE = "usage-insights-delegation";

export type DelegationTier = "worker" | "reasoning/review" | "other";

export interface DelegationPoint {
  agent: string;
  /** "single" for a direct `agent` call, "batch" for an entry in a `tasks` list. */
  mode: "single" | "batch";
  tier: DelegationTier;
  timestamp: string;
}

export interface DelegationSummary {
  agentBreakdown: Array<{ agent: string; count: number; tier: DelegationTier }>;
  batchCalls: number;
  tierBreakdown: Array<{ count: number; tier: DelegationTier }>;
  totalDelegations: number;
}

const TIER_BY_AGENT: Record<string, DelegationTier> = {
  luna: "worker",
  sol: "reasoning/review",
};

const TIER_ORDER: DelegationTier[] = ["worker", "reasoning/review", "other"];

export function tierForAgent(agent: string): DelegationTier {
  return TIER_BY_AGENT[agent.toLowerCase()] ?? "other";
}

export function delegationsFromToolCall(
  event: unknown,
  now: () => string = () => new Date().toISOString(),
): DelegationPoint[] {
  const record = asRecord(event);
  if (record?.toolName !== "subagent") {
    return [];
  }

  const input = asRecord(record.input);
  if (!input) {
    return [];
  }

  const timestamp = now();
  const points: DelegationPoint[] = [];

  if (typeof input.agent === "string" && input.agent.length > 0) {
    points.push({ agent: input.agent, mode: "single", tier: tierForAgent(input.agent), timestamp });
  }

  if (Array.isArray(input.tasks)) {
    for (const task of input.tasks) {
      const agent = asRecord(task)?.agent;
      if (typeof agent === "string" && agent.length > 0) {
        points.push({ agent, mode: "batch", tier: tierForAgent(agent), timestamp });
      }
    }
  }

  return points;
}

export function summarizeDelegations(points: DelegationPoint[]): DelegationSummary {
  const agentCounts = new Map<string, number>();
  const tierCounts = new Map<DelegationTier, number>();
  let batchCalls = 0;

  for (const point of points) {
    agentCounts.set(point.agent, (agentCounts.get(point.agent) ?? 0) + 1);
    tierCounts.set(point.tier, (tierCounts.get(point.tier) ?? 0) + 1);
    if (point.mode === "batch") {
      batchCalls += 1;
    }
  }

  return {
    agentBreakdown: Array.from(agentCounts.entries())
      .map(([agent, count]) => ({ agent, count, tier: tierForAgent(agent) }))
      .sort((left, right) => right.count - left.count || left.agent.localeCompare(right.agent)),
    batchCalls,
    tierBreakdown: TIER_ORDER.flatMap((tier) => {
      const count = tierCounts.get(tier);
      return count ? [{ count, tier }] : [];
    }),
    totalDelegations: points.length,
  };
}

export function formatDelegationSummary(summary: DelegationSummary): string[] {
  if (summary.totalDelegations === 0) {
    return ["", "## Delegation", "", "No subagent delegations recorded."];
  }

  return [
    "",
    "## Delegation",
    "",
    `Delegations: ${summary.totalDelegations} (${summary.batchCalls} via task batches)`,
    ...summary.tierBreakdown.map((item) => `- ${item.tier}: ${item.count}`),
    "",
    ...summary.agentBreakdown.map((item) => `- \`${item.agent}\` (${item.tier}): ${item.count}`),
  ];
}

export function delegationPointFromSessionEntry(entry: unknown): DelegationPoint | undefined {
  const record = asRecord(entry);
  if (record?.type !== "custom" || record.customType !== DELEGATION_ENTRY_TYPE) {
    return undefined;
  }

  const data = asRecord(record.data);
  if (!data) {
    return undefined;
  }

  const agent = typeof data.agent === "string" ? data.agent : undefined;
  const timestamp = typeof data.timestamp === "string" ? data.timestamp : undefined;
  if (!agent || !timestamp) {
    return undefined;
  }

  return {
    agent,
    mode: data.mode === "batch" ? "batch" : "single",
    tier: tierForAgent(agent),
    timestamp,
  };
}

export function delegationPointsFromEntries(entries: PiSessionEntryLike[]): DelegationPoint[] {
  return entries
    .map((entry) => delegationPointFromSessionEntry(entry))
    .filter((point): point is DelegationPoint => point !== undefined);
}

export function delegationPointsFromJsonl(input: string): DelegationPoint[] {
  return parseJsonLines<unknown>(input)
    .map((line) => delegationPointFromSessionEntry(line.value))
    .filter((point): point is DelegationPoint => point !== undefined);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}
