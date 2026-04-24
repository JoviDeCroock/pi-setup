import assert from "node:assert/strict";
import test from "node:test";

import { createRtkRewriteExtension, type RtkCommandRunner } from "../src/index.js";

test("rtk rewrite extension mutates bash tool calls", async () => {
  let handler:
    | ((event: unknown, ctx: { cwd: string; hasUI: boolean }) => Promise<void>)
    | undefined;
  const runner: RtkCommandRunner = async () => ({
    exitCode: 0,
    stderr: "",
    stdout: "rtk git status\n",
  });

  const extension = createRtkRewriteExtension({ runner });
  extension({
    on(eventName: string, registeredHandler: typeof handler) {
      if (eventName === "tool_call") {
        handler = registeredHandler;
      }
    },
    registerTool() {},
  });

  const event = {
    input: { command: "git status" },
    toolName: "bash",
  };

  await handler?.(event, { cwd: process.cwd(), hasUI: false });

  assert.equal(event.input.command, "rtk git status");
});

test("rtk rewrite extension leaves non-bash tool calls unchanged", async () => {
  let handler:
    | ((event: unknown, ctx: { cwd: string; hasUI: boolean }) => Promise<void>)
    | undefined;
  const runner: RtkCommandRunner = async () => {
    throw new Error("runner should not be called for non-bash tools");
  };

  const extension = createRtkRewriteExtension({ runner });
  extension({
    on(eventName: string, registeredHandler: typeof handler) {
      if (eventName === "tool_call") {
        handler = registeredHandler;
      }
    },
    registerTool() {},
  });

  const event = {
    input: { path: "README.md" },
    toolName: "read",
  };

  await handler?.(event, { cwd: process.cwd(), hasUI: false });

  assert.deepEqual(event.input, { path: "README.md" });
});
