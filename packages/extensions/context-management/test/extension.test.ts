import assert from "node:assert/strict";
import test from "node:test";

import type {
  PiCustomMessage,
  PiExtensionApi,
  PiExtensionContext,
  PiSendMessageOptions,
} from "@pi-setup/pi-kit";

import { createContextManagementExtension } from "../src/index.js";

function eligibleContext(overrides: Partial<PiExtensionContext> = {}): PiExtensionContext {
  return {
    cwd: "/tmp/project",
    getContextUsage: () => ({ contextWindow: 200_000, percent: 86, tokens: 172_000 }),
    hasUI: true,
    mode: "tui",
    model: { api: "openai-codex-responses", id: "gpt-5", provider: "openai-codex" },
    ...overrides,
  };
}

test("new_context terminates and continues with only the explicit history note", async () => {
  const handlers = new Map<string, (event: unknown, ctx: PiExtensionContext) => Promise<unknown>>();

  const entries: Array<{ customType: string; data: unknown }> = [];
  const sent: Array<{ message: PiCustomMessage; options: PiSendMessageOptions }> = [];
  let aborted = false;

  const pi: PiExtensionApi = {
    appendEntry(customType, data) {
      entries.push({ customType, data });
    },
    on(name, handler) {
      handlers.set(name, handler as (event: unknown, ctx: PiExtensionContext) => Promise<unknown>);
    },
    registerTool() {},
    sendMessage(message, options) {
      sent.push({ message, options: options ?? {} });
    },
  };

  createContextManagementExtension({ now: () => 123, uuid: () => "boundary-1" })(pi);
  const ctx = eligibleContext({
    abort() {
      aborted = true;
    },
  });

  const boundaryResult = await handlers.get("tool_call")?.(
    {
      input: { note: "Goal: finish the migration\nNext: run tests" },
      toolName: "new_context",
    },
    ctx,
  );
  assert.deepEqual(boundaryResult, {
    block: true,
    reason: "Context boundary accepted. Continuing from the plaintext checkpoint.",
    terminate: true,
  });
  assert.equal(aborted, true);

  await handlers.get("agent_settled")?.({}, ctx);
  assert.equal(entries.length, 2);
  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.message.customType, "context-management-history-note");
  assert.match(String(sent[0]?.message.content), /finish the migration/);
  assert.deepEqual(sent[0]?.options, { triggerTurn: true });

  const staleUsageReminder = await handlers.get("before_agent_start")?.(
    { systemPrompt: "base" },
    ctx,
  );
  assert.equal(staleUsageReminder, undefined);

  const freshContext = eligibleContext({
    getContextUsage: () => ({ contextWindow: 200_000, percent: 5, tokens: 10_000 }),
  });
  await handlers.get("turn_end")?.({}, freshContext);
  const freshUsageReminder = await handlers.get("before_agent_start")?.(
    { systemPrompt: "base" },
    freshContext,
  );
  assert.equal(freshUsageReminder, undefined);

  const old = { role: "assistant", content: "old opaque reasoning" };
  const boundary = sent[0]?.message ?? {};
  const current = { role: "user", content: "continue" };
  const filtered = await handlers.get("context")?.({ messages: [old, boundary, current] }, ctx);
  assert.deepEqual(filtered, { messages: [boundary, current] });

  const compaction = await handlers.get("session_before_compact")?.({}, ctx);
  assert.deepEqual(compaction, { cancel: true });
  const treeSummary = await handlers.get("session_before_tree")?.({}, ctx);
  assert.deepEqual(treeSummary, { cancel: true });
});

test("reminder is appended only for eligible low-budget sessions", async () => {
  const handlers = new Map<string, (event: unknown, ctx: PiExtensionContext) => Promise<unknown>>();
  const pi: PiExtensionApi = {
    getActiveTools: () => ["history_note", "new_context"],
    on(name, handler) {
      handlers.set(name, handler as (event: unknown, ctx: PiExtensionContext) => Promise<unknown>);
    },
    registerTool() {},
  };

  createContextManagementExtension()(pi);
  const beforeStart = handlers.get("before_agent_start");
  const eligible = await beforeStart?.({ systemPrompt: "base" }, eligibleContext());
  assert.match(String((eligible as { systemPrompt?: string }).systemPrompt), /28000 tokens remain/);

  const excluded = await beforeStart?.(
    { systemPrompt: "base" },
    eligibleContext({ mode: "print" }),
  );
  assert.equal(excluded, undefined);
});

test("a threshold crossed during a tool loop injects one reminder into the next request", async () => {
  const handlers = new Map<string, (event: unknown, ctx: PiExtensionContext) => Promise<unknown>>();
  const pi: PiExtensionApi = {
    getActiveTools: () => ["history_note", "new_context"],
    on(name, handler) {
      handlers.set(name, handler as (event: unknown, ctx: PiExtensionContext) => Promise<unknown>);
    },
    registerTool() {},
  };

  createContextManagementExtension()(pi);
  const ctx = eligibleContext();
  await handlers.get("turn_end")?.({}, ctx);

  const first = await handlers.get("context")?.({ messages: [{ role: "user" }] }, ctx);
  assert.match(JSON.stringify(first), /28000 tokens remain/);

  const second = await handlers.get("context")?.({ messages: [{ role: "user" }] }, ctx);
  assert.doesNotMatch(JSON.stringify(second), /28000 tokens remain/);
});
