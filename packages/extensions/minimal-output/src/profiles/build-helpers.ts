import { parseLocationFromLine } from "../common.js";

export function cleanupBuildLine(input: string): string {
  return input
    .replace(/^\[[^\]]+\]\s*/u, "")
    .replace(/^[×✘]\s*/u, "")
    .trim();
}

export function isBuildNoiseLine(input: string): boolean {
  return /^(?:✓|✔|\d+ modules transformed|transforming|rendering chunks|computing gzip size|dist\/|\.next\/|asset\s+|Entrypoint\s+|webpack \d|Done in \d|\[\d+\/\d+\])/iu.test(
    input,
  );
}

export function parseBuildLocation(input: string):
  | {
      column?: number | undefined;
      file?: string | undefined;
      line?: number | undefined;
      message?: string | undefined;
    }
  | undefined {
  return parseLocationFromLine(input);
}
