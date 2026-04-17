import assert from "node:assert/strict";
import test from "node:test";

import { summarizeUsage, usagePointsFromJsonl } from "../src/index.js";

test("usagePointsFromJsonl parses custom session entries", () => {
  const points = usagePointsFromJsonl(
    [
      JSON.stringify({
        customType: "usage-insights",
        data: {
          contextTokens: 1_200,
          model: "gpt-5.4",
          timestamp: "2026-04-16T08:00:00.000Z",
          toolNames: ["read", "bash"],
          turnIndex: 1,
        },
        type: "custom",
      }),
    ].join("\n"),
  );

  assert.equal(points.length, 1);
  assert.equal(points[0]?.toolNames[1], "bash");
});

test("summarizeUsage aggregates tool counts", () => {
  const summary = summarizeUsage([
    {
      model: "gpt-5.4",
      timestamp: "2026-04-16T08:00:00.000Z",
      toolNames: ["read", "bash"],
      turnIndex: 1,
    },
    {
      model: "gpt-5.4",
      timestamp: "2026-04-16T08:01:00.000Z",
      toolNames: ["read"],
      turnIndex: 2,
    },
  ]);

  assert.equal(summary.totalTurns, 2);
  assert.equal(summary.totalToolCalls, 3);
  assert.equal(summary.toolBreakdown[0]?.name, "read");
  assert.equal(summary.toolBreakdown[0]?.count, 2);
});
