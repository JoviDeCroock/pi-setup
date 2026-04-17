import assert from "node:assert/strict";
import test from "node:test";

import { normalizeToolExecutionArgs, textResult } from "../src/index.js";

test("textResult returns a Pi-compatible text payload", () => {
  assert.deepEqual(textResult("ready"), {
    content: [{ type: "text", text: "ready" }],
  });
});

test("normalizeToolExecutionArgs tolerates mixed runtime ordering", () => {
  const signal = new AbortController().signal;
  const ctx = { cwd: "/repo", hasUI: false };
  const onUpdate = () => undefined;

  const normalized = normalizeToolExecutionArgs<{ scope: string }>([
    "call-1",
    { scope: "working-tree" },
    onUpdate,
    ctx,
    signal,
  ]);

  assert.equal(normalized.toolCallId, "call-1");
  assert.equal(normalized.params.scope, "working-tree");
  assert.equal(normalized.ctx?.cwd, "/repo");
  assert.equal(normalized.onUpdate, onUpdate);
  assert.equal(normalized.signal, signal);
});
