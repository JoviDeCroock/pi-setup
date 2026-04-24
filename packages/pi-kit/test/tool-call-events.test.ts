import assert from "node:assert/strict";
import test from "node:test";

import { isBashToolCallEvent } from "../src/index.js";

test("isBashToolCallEvent narrows mutable bash command inputs", () => {
  const event: unknown = {
    input: {
      command: "git status",
      timeout: 30,
    },
    toolName: "bash",
  };

  assert.equal(isBashToolCallEvent(event), true);

  if (isBashToolCallEvent(event)) {
    event.input.command = "rtk git status";
    assert.equal(event.input.command, "rtk git status");
  }
});

test("isBashToolCallEvent rejects non-bash and malformed events", () => {
  assert.equal(isBashToolCallEvent({ input: { command: "git status" }, toolName: "read" }), false);
  assert.equal(isBashToolCallEvent({ input: { path: "README.md" }, toolName: "bash" }), false);
  assert.equal(isBashToolCallEvent(undefined), false);
});
