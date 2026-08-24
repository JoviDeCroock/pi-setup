import assert from "node:assert/strict";
import test from "node:test";

import { validateManagedMcpConfig } from "../src/index.js";

const validConfig = {
  settings: {
    autoAuth: false,
    directTools: false,
    hostConfigDiscovery: "off",
    scriptMode: false,
  },
  mcpServers: {
    notion: {
      auth: "oauth",
      lifecycle: "lazy",
      protocolVersion: "auto",
      url: "https://mcp.notion.com/mcp",
    },
  },
};

test("validateManagedMcpConfig accepts the fixed proxy-only Notion declaration", () => {
  assert.deepEqual(validateManagedMcpConfig(validConfig), { ok: true, problems: [] });
});

test("validateManagedMcpConfig rejects extra servers and credential-bearing fields", () => {
  const result = validateManagedMcpConfig({
    ...validConfig,
    mcpServers: {
      ...validConfig.mcpServers,
      private: {
        command: "secret-helper",
        env: { API_KEY: "do-not-commit" },
      },
    },
  });

  assert.equal(result.ok, false);
  assert.match(result.problems.join("\n"), /expected only: notion/u);
});

test("validateManagedMcpConfig rejects unexpected Notion fields and changed safety settings", () => {
  const result = validateManagedMcpConfig({
    settings: { ...validConfig.settings, scriptMode: true },
    mcpServers: {
      notion: {
        ...validConfig.mcpServers.notion,
        headers: { Authorization: "secret" },
      },
    },
  });

  assert.equal(result.ok, false);
  assert.match(result.problems.join("\n"), /Unexpected keys in mcpServers\.notion/u);
  assert.match(result.problems.join("\n"), /scriptMode/u);
});
