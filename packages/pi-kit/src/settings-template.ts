import type { PiPackageEntry } from "./package-policy.js";

export type JsonValue = JsonArray | JsonObject | boolean | null | number | string;
export interface JsonArray extends Array<JsonValue> {}
export interface JsonObject {
  [key: string]: JsonValue;
}

export interface RenderSettingsTemplateOptions {
  defaultPackages: PiPackageEntry[];
  overlay?: JsonObject;
  template: string;
  workspaceRoot: string;
}

export function renderSettingsTemplateText(options: RenderSettingsTemplateOptions): string {
  const escapedWorkspaceRoot = JSON.stringify(options.workspaceRoot).slice(1, -1);
  const renderedPackages = JSON.stringify(
    stripPackagePolicyMetadata(options.defaultPackages),
    null,
    2,
  );
  const rendered = options.template
    .replaceAll("__PI_SETUP_ROOT__", escapedWorkspaceRoot)
    .replace('"__PI_SETUP_DEFAULT_PACKAGES__"', renderedPackages);
  const parsed = JSON.parse(rendered) as unknown;

  if (!isJsonObject(parsed)) {
    throw new Error("Rendered Pi settings template must produce a JSON object.");
  }

  const settings = options.overlay ? mergeJsonObjects(parsed, options.overlay) : parsed;
  return `${JSON.stringify(settings, null, 2)}\n`;
}

export function stripPackagePolicyMetadata(packages: PiPackageEntry[]): JsonObject[] {
  return packages.map(({ publishedAt: _publishedAt, ...entry }) => entry as JsonObject);
}

export function mergeJsonObjects(base: JsonObject, overlay: JsonObject): JsonObject {
  const merged: JsonObject = { ...base };

  for (const [key, overlayValue] of Object.entries(overlay)) {
    const baseValue = merged[key];

    if (isJsonObject(baseValue) && isJsonObject(overlayValue)) {
      merged[key] = mergeJsonObjects(baseValue, overlayValue);
      continue;
    }

    merged[key] = overlayValue;
  }

  return merged;
}

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
