import assert from "node:assert/strict";
import test from "node:test";

import { applyToolPruner, createToolPrunerExtension } from "../src/index.js";

test("applyToolPruner sets active tools to the allowed subset", () => {
  let activeTools: string[] = [];

  const result = applyToolPruner(
    {
      getAllTools: () => [
        { name: "read" },
        { name: "bash" },
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

test("tool pruner reapplies before each agent start", async () => {
  let activeTools: string[] = [];
  let beforeAgentStart:
    | ((event: unknown, ctx: { cwd: string; hasUI: boolean }) => Promise<void>)
    | undefined;
  const availableTools = [{ name: "read" }, { name: "bash" }, { name: "subagent" }];

  const extension = createToolPrunerExtension({ env: { PI_TOOL_PRUNER_ALLOW: "read" } });
  extension({
    getAllTools: () => availableTools,
    on(eventName: string, handler: typeof beforeAgentStart) {
      if (eventName === "before_agent_start") {
        beforeAgentStart = handler;
      }
    },
    registerTool() {},
    setActiveTools(names: string[]) {
      activeTools = names;
    },
  });

  assert.deepEqual(activeTools, ["read"]);

  availableTools.push({ name: "web_search" });
  await beforeAgentStart?.({}, { cwd: process.cwd(), hasUI: false });

  assert.deepEqual(activeTools, ["read"]);
});

test("applyToolPruner does not disable everything when no allowed tools match", () => {
  let activeTools: string[] = ["subagent"];

  const result = applyToolPruner(
    {
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
