import assert from "node:assert/strict";
import test from "node:test";

import {
  DELEGATION_ENTRY_TYPE,
  delegationPointsFromJsonl,
  delegationsFromToolCall,
  formatDelegationSummary,
  summarizeDelegations,
} from "../src/index.js";

const now = () => "2026-09-09T08:00:00.000Z";

test("delegationsFromToolCall records single-agent subagent calls", () => {
  const points = delegationsFromToolCall(
    { input: { agent: "sol", task: "Review the diff." }, toolName: "subagent" },
    now,
  );

  assert.deepEqual(points, [
    { agent: "sol", mode: "single", tier: "reasoning/review", timestamp: now() },
  ]);
});

test("delegationsFromToolCall records every agent in a task batch", () => {
  const points = delegationsFromToolCall(
    {
      input: {
        tasks: [
          { agent: "luna", task: "Implement." },
          { agent: "luna", task: "Scout." },
          { agent: "reviewer", task: "Legacy name." },
          { task: "No agent field." },
        ],
      },
      toolName: "subagent",
    },
    now,
  );

  assert.deepEqual(
    points.map((point) => [point.agent, point.tier, point.mode]),
    [
      ["luna", "worker", "batch"],
      ["luna", "worker", "batch"],
      ["reviewer", "other", "batch"],
    ],
  );
});

test("delegationsFromToolCall ignores list actions, other tools, and malformed events", () => {
  assert.deepEqual(
    delegationsFromToolCall({ input: { action: "list" }, toolName: "subagent" }),
    [],
  );
  assert.deepEqual(delegationsFromToolCall({ input: { agent: "sol" }, toolName: "bash" }), []);
  assert.deepEqual(delegationsFromToolCall({ toolName: "subagent" }), []);
  assert.deepEqual(delegationsFromToolCall(undefined), []);
});

test("summarizeDelegations groups by tier and agent", () => {
  const summary = summarizeDelegations([
    { agent: "luna", mode: "batch", tier: "worker", timestamp: now() },
    { agent: "luna", mode: "single", tier: "worker", timestamp: now() },
    { agent: "sol", mode: "single", tier: "reasoning/review", timestamp: now() },
  ]);

  assert.equal(summary.totalDelegations, 3);
  assert.equal(summary.batchCalls, 1);
  assert.deepEqual(summary.tierBreakdown, [
    { count: 2, tier: "worker" },
    { count: 1, tier: "reasoning/review" },
  ]);
  assert.equal(summary.agentBreakdown[0]?.agent, "luna");

  const text = formatDelegationSummary(summary).join("\n");
  assert.match(text, /Delegations: 3 \(1 via task batches\)/u);
  assert.match(text, /`sol` \(reasoning\/review\): 1/u);
});

test("formatDelegationSummary reports an empty session", () => {
  assert.match(
    formatDelegationSummary(summarizeDelegations([])).join("\n"),
    /No subagent delegations recorded/u,
  );
});

test("delegationPointsFromJsonl parses recorded custom entries", () => {
  const points = delegationPointsFromJsonl(
    [
      JSON.stringify({
        customType: DELEGATION_ENTRY_TYPE,
        data: { agent: "luna", mode: "single", timestamp: now() },
        type: "custom",
      }),
      JSON.stringify({ customType: "usage-insights", data: {}, type: "custom" }),
      JSON.stringify({ customType: DELEGATION_ENTRY_TYPE, data: { agent: "" }, type: "custom" }),
    ].join("\n"),
  );

  assert.deepEqual(points, [{ agent: "luna", mode: "single", tier: "worker", timestamp: now() }]);
});
