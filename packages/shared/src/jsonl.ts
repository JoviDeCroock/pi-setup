import { readUtf8 } from "./fs.js";

export interface JsonLine<T> {
  lineNumber: number;
  value: T;
}

export function parseJsonLines<T>(input: string): JsonLine<T>[] {
  const lines = input.split(/\r?\n/);
  const parsed: JsonLine<T>[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index]?.trim();
    if (!rawLine) {
      continue;
    }

    try {
      parsed.push({
        lineNumber: index + 1,
        value: JSON.parse(rawLine) as T,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown JSONL parse failure";
      throw new Error(`Invalid JSONL at line ${index + 1}: ${message}`);
    }
  }

  return parsed;
}

export async function readJsonLinesFile<T>(filePath: string): Promise<T[]> {
  const content = await readUtf8(filePath);
  return parseJsonLines<T>(content).map((line) => line.value);
}
