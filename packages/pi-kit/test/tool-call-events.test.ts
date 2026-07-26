import assert from "node:assert/strict";
import test from "node:test";

import { isBashToolCallEvent, isBashToolResultEvent } from "../src/index.js";

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
    event.input.command = "git status --short";
    assert.equal(event.input.command, "git status --short");
  }
});

test("isBashToolCallEvent rejects non-bash and malformed events", () => {
  assert.equal(isBashToolCallEvent({ input: { command: "git status" }, toolName: "read" }), false);
  assert.equal(isBashToolCallEvent({ input: { path: "README.md" }, toolName: "bash" }), false);
  assert.equal(isBashToolCallEvent(undefined), false);
});

test("isBashToolResultEvent narrows patchable bash outputs", () => {
  const event: unknown = {
    content: [{ text: "src/index.ts(1,1): error TS1000: Example", type: "text" }],
    input: { command: "pnpm typecheck" },
    toolName: "bash",
  };

  assert.equal(isBashToolResultEvent(event), true);

  if (isBashToolResultEvent(event)) {
    assert.equal(event.input.command, "pnpm typecheck");
    assert.equal(event.content[0]?.text.includes("TS1000"), true);
  }
});

test("isBashToolResultEvent rejects non-bash and malformed results", () => {
  assert.equal(
    isBashToolResultEvent({
      content: [{ text: "hello", type: "text" }],
      input: { command: "pnpm typecheck" },
      toolName: "read",
    }),
    false,
  );
  assert.equal(
    isBashToolResultEvent({ input: { command: "pnpm typecheck" }, toolName: "bash" }),
    false,
  );
  assert.equal(isBashToolResultEvent(undefined), false);
});
