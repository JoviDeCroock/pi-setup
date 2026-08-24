import { isJsonObject, type JsonObject } from "./settings-template.js";

export interface ManagedMcpValidation {
  ok: boolean;
  problems: string[];
}

const EXPECTED_ROOT_KEYS = ["mcpServers", "settings"];
const EXPECTED_SETTINGS_KEYS = ["autoAuth", "directTools", "hostConfigDiscovery", "scriptMode"];
const EXPECTED_SERVER_KEYS = ["notion"];
const EXPECTED_NOTION_KEYS = ["auth", "lifecycle", "protocolVersion", "url"];

export function validateManagedMcpConfig(value: unknown): ManagedMcpValidation {
  if (!isJsonObject(value)) {
    return { ok: false, problems: ["MCP config must be a JSON object."] };
  }

  const problems: string[] = [];
  requireExactKeys(value, EXPECTED_ROOT_KEYS, "root MCP config", problems);

  const settings = value["settings"];
  if (!isJsonObject(settings)) {
    problems.push("Missing `settings` object.");
  } else {
    requireExactKeys(settings, EXPECTED_SETTINGS_KEYS, "settings", problems);
    requireValue(settings, "autoAuth", false, problems);
    requireValue(settings, "directTools", false, problems);
    requireValue(settings, "hostConfigDiscovery", "off", problems);
    requireValue(settings, "scriptMode", false, problems);
  }

  const servers = value["mcpServers"];
  if (!isJsonObject(servers)) {
    problems.push("Missing `mcpServers` object.");
  } else {
    requireExactKeys(servers, EXPECTED_SERVER_KEYS, "mcpServers", problems);
    validateNotionServer(servers["notion"], problems);
  }

  return { ok: problems.length === 0, problems };
}

function validateNotionServer(value: unknown, problems: string[]): void {
  if (!isJsonObject(value)) {
    problems.push("Missing `mcpServers.notion` object.");
    return;
  }

  requireExactKeys(value, EXPECTED_NOTION_KEYS, "mcpServers.notion", problems);
  requireValue(value, "auth", "oauth", problems);
  requireValue(value, "lifecycle", "lazy", problems);
  requireValue(value, "protocolVersion", "auto", problems);
  requireValue(value, "url", "https://mcp.notion.com/mcp", problems);
}

function requireExactKeys(
  value: JsonObject,
  expectedKeys: string[],
  label: string,
  problems: string[],
): void {
  const actualKeys = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (actualKeys.join("\0") !== expected.join("\0")) {
    problems.push(`Unexpected keys in ${label}; expected only: ${expected.join(", ")}.`);
  }
}

function requireValue(
  value: JsonObject,
  key: string,
  expected: boolean | string,
  problems: string[],
): void {
  if (value[key] !== expected) {
    problems.push(`Expected \`${key}\` to equal \`${String(expected)}\`.`);
  }
}
