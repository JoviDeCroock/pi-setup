import assert from "node:assert/strict";
import test from "node:test";

import {
  isToolPrunerDisabled,
  parseToolNameList,
  pruneToolNames,
  resolveAllowedToolNames,
} from "../src/index.js";

test("parseToolNameList accepts comma and whitespace separated tool names", () => {
  assert.deepEqual(parseToolNameList("read, bash\nedit  read"), ["read", "bash", "edit"]);
});

test("resolveAllowedToolNames uses defaults plus extra allow entries", () => {
  assert.deepEqual(
    resolveAllowedToolNames({
      defaultAllowed: ["read", "bash"],
      env: { PI_TOOL_PRUNER_EXTRA_ALLOW: "web_search" },
    }),
    ["read", "bash", "web_search"],
  );
});

test("resolveAllowedToolNames defaults include paired subagent retrieval and content tools", () => {
  const allowed = resolveAllowedToolNames({ env: {} });

  assert.ok(allowed.includes("subagent"));
  assert.ok(allowed.includes("subagent_status"));
  assert.ok(allowed.includes("web_search"));
  assert.ok(allowed.includes("fetch_content"));
  assert.ok(allowed.includes("get_search_content"));
  assert.ok(allowed.includes("mcp"));
});

test("resolveAllowedToolNames lets explicit allow replace defaults and deny removes entries", () => {
  assert.deepEqual(
    resolveAllowedToolNames({
      defaultAllowed: ["read", "bash"],
      env: { PI_TOOL_PRUNER_ALLOW: "read,web_search", PI_TOOL_PRUNER_DENY: "read" },
    }),
    ["web_search"],
  );
});

test("resolveAllowedToolNames removes the context handoff tools as an atomic pair", () => {
  assert.deepEqual(
    resolveAllowedToolNames({ env: { PI_TOOL_PRUNER_ALLOW: "read,history_note" } }),
    ["read"],
  );
  assert.deepEqual(
    resolveAllowedToolNames({ env: { PI_TOOL_PRUNER_DENY: "new_context" } }).filter(
      (name) => name === "history_note" || name === "new_context",
    ),
    [],
  );
});

test("pruneToolNames keeps only allowed tools while preserving available order", () => {
  assert.deepEqual(
    pruneToolNames({
      allowedNames: ["read", "bash"],
      availableNames: ["subagent", "read", "web_search", "bash"],
    }),
    {
      disabledNames: ["subagent", "web_search"],
      keptNames: ["read", "bash"],
    },
  );
});

test("isToolPrunerDisabled recognizes truthy opt-out values", () => {
  assert.equal(isToolPrunerDisabled({ PI_TOOL_PRUNER_DISABLED: "true" }), true);
  assert.equal(isToolPrunerDisabled({ PI_TOOL_PRUNER_DISABLED: "0" }), false);
});
