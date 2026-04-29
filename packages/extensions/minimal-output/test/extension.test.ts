import assert from "node:assert/strict";
import test from "node:test";

import { createMinimalOutputExtension } from "../src/index.js";

test("minimal output extension patches bash tool results", async () => {
  let handler:
    | ((
        event: unknown,
        ctx: { cwd: string; hasUI: boolean },
      ) => { content?: Array<{ text: string; type: "text" }>; details?: unknown } | undefined)
    | undefined;

  const extension = createMinimalOutputExtension();
  extension({
    on(eventName: string, registeredHandler: typeof handler) {
      if (eventName === "tool_result") {
        handler = registeredHandler;
      }
    },
    registerTool() {},
  });

  const event = {
    content: [
      {
        text: [
          "src/index.ts(1,2): error TS2322: Type 'string' is not assignable to type 'number'.",
          "  const count: number = '1';",
          "        ~~~~~",
          "This extra explanatory line should be removed from the model-visible result.",
        ].join("\n"),
        type: "text",
      },
    ],
    details: { fullOutputPath: "/tmp/full-output.txt" },
    input: { command: "pnpm typecheck" },
    isError: true,
    toolName: "bash",
  };

  const patch = handler?.(event, { cwd: process.cwd(), hasUI: false });

  assert.equal(patch?.content?.[0]?.text.startsWith("tsc: 1 error"), true);
  assert.ok(patch?.details);
  const details = patch.details as {
    fullOutputPath?: string;
    minimalOutput?: { profile?: string };
  };
  assert.deepEqual(details.fullOutputPath, "/tmp/full-output.txt");
  assert.equal(details.minimalOutput?.profile, "tsc");
});

test("minimal output extension rewrites supported test commands to structured reports", () => {
  let handler:
    | ((event: unknown, ctx: { cwd: string; hasUI: boolean }) => void | Promise<unknown>)
    | undefined;

  const extension = createMinimalOutputExtension({
    testReportSummaryCliPath: "/tmp/structured-report-summary.mjs",
  });
  extension({
    on(eventName: string, registeredHandler: typeof handler) {
      if (eventName === "tool_call") {
        handler = registeredHandler;
      }
    },
    registerTool() {},
  });

  const event = {
    input: { command: "vitest run src/foo.test.ts" },
    toolName: "bash",
  };

  handler?.(event, { cwd: process.cwd(), hasUI: false });

  assert.match(event.input.command, /--reporter=json/u);
  assert.match(event.input.command, /structured-report-summary\.mjs/u);
});

test("minimal output extension ignores non-bash results", () => {
  let handler:
    | ((
        event: unknown,
        ctx: { cwd: string; hasUI: boolean },
      ) => { content?: Array<{ text: string; type: "text" }> } | undefined)
    | undefined;

  const extension = createMinimalOutputExtension();
  extension({
    on(eventName: string, registeredHandler: typeof handler) {
      if (eventName === "tool_result") {
        handler = registeredHandler;
      }
    },
    registerTool() {},
  });

  const patch = handler?.(
    {
      content: [{ text: "src/index.ts(1,2): error TS2322: nope", type: "text" }],
      input: { command: "pnpm typecheck" },
      toolName: "read",
    },
    { cwd: process.cwd(), hasUI: false },
  );

  assert.equal(patch, undefined);
});
