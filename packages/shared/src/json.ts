import { readUtf8, writeUtf8 } from "./fs.js";

export async function readJsonFile<T>(filePath: string): Promise<T> {
  const content = await readUtf8(filePath);
  return JSON.parse(content) as T;
}

export async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await writeUtf8(filePath, `${stableJsonStringify(value)}\n`);
}

export function stableJsonStringify(value: unknown): string {
  return JSON.stringify(sortJsonValue(value), null, 2);
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right),
    );

    return Object.fromEntries(entries.map(([key, nested]) => [key, sortJsonValue(nested)]));
  }

  return value;
}
