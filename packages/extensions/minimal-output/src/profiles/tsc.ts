import type { DiagnosticSummary, ParsedDiagnostics } from "../types.js";

export function parseTscDiagnostics(output: string): ParsedDiagnostics {
  const diagnostics: ParsedDiagnostics["diagnostics"] = [];
  let summary: DiagnosticSummary | undefined;

  for (const line of output.replace(/\r\n/g, "\n").split("\n")) {
    const compact = line.match(/^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.+)$/iu);
    if (compact) {
      diagnostics.push({
        code: compact[5],
        column: Number(compact[3]),
        file: compact[1],
        line: Number(compact[2]),
        message: compact[6] ?? "",
        severity: compact[4]?.toLowerCase() === "warning" ? "warning" : "error",
      });
      continue;
    }

    const pretty = line.match(/^(.+?):(\d+):(\d+)\s+-\s+(error|warning)\s+(TS\d+):\s+(.+)$/iu);
    if (pretty) {
      diagnostics.push({
        code: pretty[5],
        column: Number(pretty[3]),
        file: pretty[1],
        line: Number(pretty[2]),
        message: pretty[6] ?? "",
        severity: pretty[4]?.toLowerCase() === "warning" ? "warning" : "error",
      });
      continue;
    }

    const global = line.match(/^(error|warning)\s+(TS\d+):\s+(.+)$/iu);
    if (global) {
      diagnostics.push({
        code: global[2],
        message: global[3] ?? "",
        severity: global[1]?.toLowerCase() === "warning" ? "warning" : "error",
      });
      continue;
    }

    const found = line.match(/Found\s+(\d+)\s+errors?\b/iu);
    if (found) {
      summary = { errors: Number(found[1]), warnings: 0 };
    }
  }

  return buildParsed(diagnostics, summary);
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
