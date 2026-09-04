export const DEFAULT_ALLOWED_TOOL_NAMES = [
  "read",
  "bash",
  "edit",
  "write",
  "history_note",
  "new_context",
  "usage_insights_report",
  "subagent",
  "subagent_status",
  "web_search",
  "fetch_content",
  "get_search_content",
  "mcp",
] as const;

export interface ToolPrunerEnvironment {
  PI_TOOL_PRUNER_ALLOW?: string;
  PI_TOOL_PRUNER_DENY?: string;
  PI_TOOL_PRUNER_DISABLED?: string;
  PI_TOOL_PRUNER_EXTRA_ALLOW?: string;
}

export interface ResolveAllowedToolNamesOptions {
  defaultAllowed?: readonly string[];
  env?: ToolPrunerEnvironment;
}

export interface PruneToolNamesOptions {
  allowedNames: readonly string[];
  availableNames: readonly string[];
}

export interface PruneToolNamesResult {
  disabledNames: string[];
  keptNames: string[];
}

export function isToolPrunerDisabled(env: ToolPrunerEnvironment = process.env): boolean {
  const value = env.PI_TOOL_PRUNER_DISABLED?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

export function resolveAllowedToolNames(options: ResolveAllowedToolNamesOptions = {}): string[] {
  const env = options.env ?? process.env;
  const explicitAllow = parseToolNameList(env.PI_TOOL_PRUNER_ALLOW);
  const extraAllow = parseToolNameList(env.PI_TOOL_PRUNER_EXTRA_ALLOW);
  const denied = new Set(parseToolNameList(env.PI_TOOL_PRUNER_DENY));
  const base =
    explicitAllow.length > 0
      ? explicitAllow
      : [...(options.defaultAllowed ?? DEFAULT_ALLOWED_TOOL_NAMES)];

  const allowed = uniqueToolNames([...base, ...extraAllow]).filter((name) => !denied.has(name));
  const hasHistoryNote = allowed.includes("history_note");
  const hasNewContext = allowed.includes("new_context");
  return hasHistoryNote === hasNewContext
    ? allowed
    : allowed.filter((name) => name !== "history_note" && name !== "new_context");
}

export function pruneToolNames(options: PruneToolNamesOptions): PruneToolNamesResult {
  const allowed = new Set(options.allowedNames);
  const keptNames = uniqueToolNames(options.availableNames).filter((name) => allowed.has(name));
  const kept = new Set(keptNames);
  const disabledNames = uniqueToolNames(options.availableNames).filter((name) => !kept.has(name));

  return { disabledNames, keptNames };
}

export function parseToolNameList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return uniqueToolNames(
    value
      .split(/[\s,]+/u)
      .map((name) => name.trim())
      .filter((name) => name.length > 0),
  );
}

function uniqueToolNames(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const name of names) {
    if (!seen.has(name)) {
      seen.add(name);
      result.push(name);
    }
  }

  return result;
}
