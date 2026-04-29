import { looksLikePath } from "../common.js";
import type { DiagnosticSummary, ParsedDiagnostics } from "../types.js";

export function parseLintDiagnostics(output: string): ParsedDiagnostics {
  const diagnostics: ParsedDiagnostics["diagnostics"] = [];
  let currentFile: string | undefined;
  let pendingOxlint:
    | Pick<ParsedDiagnostics["diagnostics"][number], "code" | "message" | "severity">
    | undefined;
  let summary: DiagnosticSummary | undefined;

  for (const rawLine of output.replace(/\r\n/g, "\n").split("\n")) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    const eslintSummary = trimmed.match(
      /(?:✖|×)?\s*(\d+)\s+problems?\s+\((\d+)\s+errors?,\s+(\d+)\s+warnings?\)/iu,
    );
    if (eslintSummary) {
      summary = { errors: Number(eslintSummary[2]), warnings: Number(eslintSummary[3]) };
      continue;
    }

    const foundSummary = trimmed.match(
      /Found\s+(?:(\d+)\s+errors?)?(?:\s+and\s+)?(?:(\d+)\s+warnings?)?/iu,
    );
    if (foundSummary && (foundSummary[1] || foundSummary[2])) {
      summary = { errors: Number(foundSummary[1] ?? 0), warnings: Number(foundSummary[2] ?? 0) };
      continue;
    }

    const compact = trimmed.match(/^(.+?):(\d+):(\d+):\s+(error|warning)\s+(.+)$/iu);
    if (compact && looksLikePath(compact[1] ?? "")) {
      const parsed = splitLintMessage(compact[5] ?? "");
      diagnostics.push({
        code: parsed.rule,
        column: Number(compact[3]),
        file: compact[1],
        line: Number(compact[2]),
        message: parsed.message,
        severity: compact[4]?.toLowerCase() === "warning" ? "warning" : "error",
      });
      continue;
    }

    const stylish = line.match(/^\s*(\d+):(\d+)\s+(error|warning)\s+(.+)$/iu);
    if (stylish && currentFile) {
      const parsed = splitLintMessage(stylish[4] ?? "");
      diagnostics.push({
        code: parsed.rule,
        column: Number(stylish[2]),
        file: currentFile,
        line: Number(stylish[1]),
        message: parsed.message,
        severity: stylish[3]?.toLowerCase() === "warning" ? "warning" : "error",
      });
      continue;
    }

    const oxlintMessage = trimmed.match(/^[×✖]\s+[^:]+\(([^)]+)\):\s+(.+)$/iu);
    if (oxlintMessage) {
      pendingOxlint = {
        code: oxlintMessage[1],
        message: oxlintMessage[2] ?? "",
        severity: "error",
      };
      continue;
    }

    const oxlintLocation = trimmed.match(/[╭┌]-?\[(.+?):(\d+):(\d+)\]/u);
    if (oxlintLocation && pendingOxlint) {
      diagnostics.push({
        ...pendingOxlint,
        column: Number(oxlintLocation[3]),
        file: oxlintLocation[1],
        line: Number(oxlintLocation[2]),
      });
      pendingOxlint = undefined;
      continue;
    }

    if (trimmed && looksLikePath(trimmed) && !/\s/.test(trimmed)) {
      currentFile = trimmed;
    }
  }

  return buildParsed(diagnostics, summary);
}

function splitLintMessage(input: string): { message: string; rule?: string } {
  const match = input.match(/^(.*?)\s+((?:@?[\w-]+\/)?[\w-]+(?:\/[\w-]+)?)$/u);
  if (!match) {
    return { message: input.trim() };
  }

  const maybeRule = match[2] ?? "";
  if (!maybeRule.includes("-") && !maybeRule.includes("/")) {
    return { message: input.trim() };
  }

  return { message: (match[1] ?? "").trim(), rule: maybeRule };
}

function buildParsed(
  diagnostics: ParsedDiagnostics["diagnostics"],
  summary?: DiagnosticSummary,
): ParsedDiagnostics {
  if (summary) {
    return { diagnostics, summary };
  }
  return { diagnostics };
}
