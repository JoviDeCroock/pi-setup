import assert from "node:assert/strict";
import test from "node:test";

import { applyToolPruner, createToolPrunerExtension } from "../src/index.js";

test("applyToolPruner prunes the active subset without re-enabling unavailable tools", () => {
  let activeTools: string[] = [];

  const result = applyToolPruner(
    {
      getActiveTools: () => ["read", "bash", "subagent", "web_search"],
      getAllTools: () => [
        { name: "read" },
        { name: "bash" },
        { name: "edit" },
        { name: "write" },
        { name: "subagent" },
        { name: "web_search" },
      ],
      on() {},
      registerTool() {},
      setActiveTools: (names) => {
        activeTools = names;
      },
    },
    { env: { PI_TOOL_PRUNER_ALLOW: "read,bash" } },
  );

  assert.deepEqual(activeTools, ["read", "bash"]);
  assert.deepEqual(result.disabledNames, ["subagent", "web_search"]);
});

test("tool pruner defers action methods until runtime events", async () => {
  let activeTools = ["read", "bash", "subagent"];
  let sessionStart:
    | ((event: unknown, ctx: { cwd: string; hasUI: boolean }) => Promise<void>)
    | undefined;
  let beforeAgentStart:
    | ((event: unknown, ctx: { cwd: string; hasUI: boolean }) => Promise<void>)
    | undefined;

  const extension = createToolPrunerExtension({ env: { PI_TOOL_PRUNER_ALLOW: "read" } });
  extension({
    getActiveTools: () => activeTools,
    getAllTools: () => activeTools.map((name) => ({ name })),
    on(eventName: string, handler: typeof beforeAgentStart) {
      if (eventName === "session_start") {
        sessionStart = handler;
      }
      if (eventName === "before_agent_start") {
        beforeAgentStart = handler;
      }
    },
    registerTool() {},
    setActiveTools(names: string[]) {
      activeTools = names;
    },
  });

  assert.deepEqual(activeTools, ["read", "bash", "subagent"]);

  await sessionStart?.({}, { cwd: process.cwd(), hasUI: false });
  assert.deepEqual(activeTools, ["read"]);

  activeTools.push("web_search");
  await beforeAgentStart?.({}, { cwd: process.cwd(), hasUI: false });

  assert.deepEqual(activeTools, ["read"]);
});

test("applyToolPruner does not disable everything when no allowed tools match", () => {
  let activeTools: string[] = ["subagent"];

  const result = applyToolPruner(
    {
      getActiveTools: () => ["subagent"],
      getAllTools: () => [{ name: "subagent" }],
      on() {},
      registerTool() {},
      setActiveTools: (names) => {
        activeTools = names;
      },
    },
    { env: { PI_TOOL_PRUNER_ALLOW: "read" } },
  );

  assert.deepEqual(activeTools, ["subagent"]);
  assert.equal(result.reason, "no-matches");
});
