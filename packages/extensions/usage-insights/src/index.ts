import { resolve } from "node:path";

import {
  Type,
  appendSessionEntry,
  definePiExtension,
  getSessionEntries,
  normalizeToolExecutionArgs,
  safeNotify,
  textResult,
} from "@pi-setup/pi-kit";
import { readUtf8 } from "@pi-setup/shared";

import {
  extractUsagePointFromTurnEnd,
  formatUsageSummary,
  summarizeUsage,
  usagePointsFromEntries,
  usagePointsFromJsonl,
  type UsagePoint,
} from "./analytics.js";

export interface UsageInsightsToolInput {
  limit?: number;
  sessionLogPath?: string;
}

const livePoints: UsagePoint[] = [];

const usageInsightsExtension = definePiExtension((pi) => {
  pi.on("session_start", async () => {
    livePoints.length = 0;
  });

  pi.on("turn_end", async (event, ctx) => {
    const point = extractUsagePointFromTurnEnd(event, ctx);
    livePoints.push(point);
    appendSessionEntry(pi, "usage-insights", point);
  });

  pi.registerTool({
    description:
      "Summarize Pi session usage from the active session or from an exported JSONL session file.",
    name: "usage_insights_report",
    parameters: Type.Object({
      limit: Type.Optional(
        Type.Integer({
          description: "Restrict the report to the most recent N usage points.",
          maximum: 500,
          minimum: 1,
        }),
      ),
      sessionLogPath: Type.Optional(
        Type.String({
          description:
            "Optional path to a JSONL session export. When omitted, the tool inspects the active session when possible.",
        }),
      ),
    }),
    execute: async (...rawArgs: unknown[]) => {
      const { ctx, params } = normalizeToolExecutionArgs<UsageInsightsToolInput>(rawArgs);

      try {
        let points: UsagePoint[];

        if (params.sessionLogPath) {
          const absolutePath = resolve(ctx?.cwd ?? process.cwd(), params.sessionLogPath);
          const content = await readUtf8(absolutePath);
          points = usagePointsFromJsonl(content);
        } else {
          points = usagePointsFromEntries(getSessionEntries(ctx));
          if (points.length === 0) {
            points = [...livePoints];
          }
        }

        if (params.limit) {
          points = points.slice(-params.limit);
        }

        if (points.length === 0) {
          return textResult(
            "No usage data is available yet. Use Pi for a few turns or pass `sessionLogPath` to inspect an exported JSONL session.",
          );
        }

        const summary = summarizeUsage(points);
        safeNotify(ctx, `Usage insights compiled from ${points.length} points.`);

        return textResult(formatUsageSummary(summary), {
          pointCount: points.length,
          summary,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unexpected usage insights failure.";
        safeNotify(ctx, message, "warning");
        return textResult(`usage_insights_report failed.\n\n${message}`, { error: message });
      }
    },
  });
});

export * from "./analytics.js";

export default usageInsightsExtension;
