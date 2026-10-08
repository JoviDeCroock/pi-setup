import assert from "node:assert/strict";
import test from "node:test";

import {
  HISTORY_NOTE_CUSTOM_TYPE,
  MAX_HISTORY_NOTE_CHARS,
  buildContextWindowReminder,
  normalizeHistoryNote,
  resolveContextManagementEligibility,
  sliceAfterLatestHistoryNote,
} from "../src/context.js";

const baseContext = {
  cwd: "/tmp/project",
  hasUI: true,
  mode: "tui" as const,
  model: { api: "openai-codex-responses", id: "gpt-5", provider: "openai-codex" },
};

test("eligibility is limited to interactive openai-codex sessions", () => {
  assert.deepEqual(resolveContextManagementEligibility(baseContext), { eligible: true });
  assert.equal(
    resolveContextManagementEligibility({ ...baseContext, mode: "print" }).reason,
    "non-interactive",
  );
  assert.equal(
    resolveContextManagementEligibility({ ...baseContext, model: { provider: "openai" } }).reason,
    "unsupported-provider",
  );
  assert.equal(
    resolveContextManagementEligibility(baseContext, {
      PI_CONTEXT_MANAGEMENT_EXPERIMENTAL_MODE: "false",
    }).reason,
    "disabled",
  );
});

test("reminder reports the actual remaining token budget", () => {
  assert.equal(
    buildContextWindowReminder({ contextWindow: 200_000, percent: 60, tokens: 120_000 }),
    undefined,
  );
  assert.match(
    buildContextWindowReminder({ contextWindow: 200_000, percent: 86, tokens: 172_000 }, 32_000) ??
      "",
    /only 28000 tokens remain/,
  );
});

test("history notes are trimmed and bounded", () => {
  assert.equal(normalizeHistoryNote("  Goal: ship  "), "Goal: ship");
  assert.throws(() => normalizeHistoryNote(" "), /must not be empty/);
  assert.throws(() => normalizeHistoryNote("x".repeat(MAX_HISTORY_NOTE_CHARS + 1)), /exceeds/);
  assert.throws(
    () => normalizeHistoryNote(`encrypted_content: ${"A".repeat(600)}`),
    /opaque reasoning marker/,
  );
});

test("context slicing drops every message before the latest plaintext boundary", () => {
  const oldReasoning = { role: "assistant", content: "opaque old state" };
  const firstBoundary = { customType: HISTORY_NOTE_CUSTOM_TYPE, content: "first" };
  const newerReasoning = { role: "assistant", content: "newer state" };
  const latestBoundary = { customType: HISTORY_NOTE_CUSTOM_TYPE, content: "latest" };
  const current = { role: "user", content: "continue" };

  assert.deepEqual(
    sliceAfterLatestHistoryNote([
      oldReasoning,
      firstBoundary,
      newerReasoning,
      latestBoundary,
      current,
    ]),
    [latestBoundary, current],
  );
});
