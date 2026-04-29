import {
  dedupeDiagnostics,
  fallbackSignificantDiagnostics,
  looksLikePath,
  parseLocationFromLine,
  splitLines,
} from "../common.js";
import { formatDiagnostics } from "../format.js";
import type {
  Diagnostic,
  FormatLimits,
  MinimizeBashOutputOptions,
  ProfileMinimization,
} from "../types.js";

interface TestSummary {
  failed?: number | undefined;
  passed?: number | undefined;
  total?: number | undefined;
}

interface ParsedTestOutput {
  diagnostics: Diagnostic[];
  summary?: TestSummary | undefined;
}

export function minimizeTestOutput(
  output: string,
  limits: FormatLimits,
  options: MinimizeBashOutputOptions,
): ProfileMinimization | undefined {
  const parsed = parseTestOutput(output);
  const fallbackDiagnostics =
    parsed.diagnostics.length === 0 && options.isError
      ? fallbackSignificantDiagnostics(output, "error")
      : [];
  const diagnostics = parsed.diagnostics.length > 0 ? parsed.diagnostics : fallbackDiagnostics;

  if (diagnostics.length === 0 && !parsed.summary) {
    return undefined;
  }

  const failed =
    parsed.summary?.failed ??
    diagnostics.filter((diagnostic) => diagnostic.severity === "error").length;
  const passed = parsed.summary?.passed;
  const total = parsed.summary?.total;
  const parts = [
    failed > 0 || options.isError ? `${failed || diagnostics.length || "some"} failed` : "ok",
  ];

  if (passed !== undefined) {
    parts.push(`${passed} passed`);
  }
  if (total !== undefined) {
    parts.push(`${total} total`);
  }

  return {
    diagnostics,
    text: formatDiagnostics(`test: ${parts.join(", ")}`, diagnostics, limits, "failures"),
  };
}

export function parseTestOutput(output: string): ParsedTestOutput {
  const diagnostics: Diagnostic[] = [];
  const summary: TestSummary = {};
  let current: Diagnostic | undefined;
  let lastSuiteFile: string | undefined;

  const flushCurrent = () => {
    if (current && current.message.trim().length > 0) {
      diagnostics.push(current);
    }
    current = undefined;
  };

  for (const rawLine of splitLines(output)) {
    const trimmed = rawLine.trim();
    if (trimmed.length === 0) {
      continue;
    }

    updateTestSummary(summary, trimmed);

    const compactDiagnostic = parseCompactDiagnosticLine(trimmed);
    if (compactDiagnostic) {
      flushCurrent();
      diagnostics.push(compactDiagnostic);
      continue;
    }

    const failedPytest = trimmed.match(/^FAILED\s+(.+?)(?:\s+-\s+(.+))?$/u);
    if (failedPytest) {
      flushCurrent();
      const location = parsePytestLocation(failedPytest[1] ?? "");
      current = {
        ...location,
        message: failedPytest[2]
          ? `${location.testName ?? failedPytest[1]} - ${failedPytest[2]}`
          : (failedPytest[1] ?? "failed"),
        severity: "error",
      };
      flushCurrent();
      continue;
    }

    const suite = trimmed.match(/^(?:FAIL|Failed|FAILURE)\s+(.+?)(?:\s+>\s+(.+))?$/iu);
    if (suite) {
      flushCurrent();
      lastSuiteFile = suite[1];
      current = {
        file: looksLikePath(lastSuiteFile ?? "") ? lastSuiteFile : undefined,
        message: suite[2] ? suite[2] : `failed ${suite[1] ?? "suite"}`,
        severity: "error",
      };
      continue;
    }

    const jestCase = trimmed.match(/^●\s+(.+)$/u);
    if (jestCase) {
      flushCurrent();
      current = {
        file: lastSuiteFile && looksLikePath(lastSuiteFile) ? lastSuiteFile : undefined,
        message: jestCase[1] ?? "failed test",
        severity: "error",
      };
      continue;
    }

    const tapCase = trimmed.match(/^not ok\s+\d+\s+-\s+(.+)$/iu);
    if (tapCase) {
      flushCurrent();
      current = {
        message: tapCase[1] ?? "failed test",
        severity: "error",
      };
      continue;
    }

    const errorLine = trimmed.match(
      /^(AssertionError|Error|TypeError|ReferenceError|SyntaxError|TimeoutError):\s*(.+)$/u,
    );
    if (errorLine) {
      if (!current) {
        current = { message: `${errorLine[1]}: ${errorLine[2] ?? ""}`, severity: "error" };
      } else if (!current.message.includes(errorLine[2] ?? "")) {
        current.message = `${current.message}: ${errorLine[2] ?? ""}`;
      }
      continue;
    }

    if (/^(Expected|Received|Actual|Expected value|Received value):/iu.test(trimmed) && current) {
      current.message = `${current.message}; ${trimmed}`;
      continue;
    }

    const location = parseLocationFromLine(trimmed);
    if (location && current) {
      applyPreferredLocation(current, location);
    }
  }

  flushCurrent();

  return {
    diagnostics: dedupeDiagnostics(diagnostics),
    summary: Object.keys(summary).length > 0 ? summary : undefined,
  };
}

function parseCompactDiagnosticLine(line: string): Diagnostic | undefined {
  const withLocation = line.match(
    /^-\s+(.+?):(\d+):(\d+)\s+(error|warning|info)(?:\s+([^:]+))?:\s+(.+)$/iu,
  );
  if (withLocation && looksLikePath(withLocation[1] ?? "")) {
    return {
      code: withLocation[5],
      column: Number(withLocation[3]),
      file: withLocation[1],
      line: Number(withLocation[2]),
      message: withLocation[6] ?? "failed test",
      severity: normalizedSeverity(withLocation[4]),
    };
  }

  const withoutLocation = line.match(/^-\s+(error|warning|info)(?:\s+([^:]+))?:\s+(.+)$/iu);
  if (withoutLocation) {
    return {
      code: withoutLocation[2],
      message: withoutLocation[3] ?? "failed test",
      severity: normalizedSeverity(withoutLocation[1]),
    };
  }

  return undefined;
}

function normalizedSeverity(input: string | undefined): Diagnostic["severity"] {
  if (input?.toLowerCase() === "warning") {
    return "warning";
  }
  if (input?.toLowerCase() === "info") {
    return "info";
  }
  return "error";
}

function applyPreferredLocation(
  current: Diagnostic,
  location: { column?: number | undefined; file?: string | undefined; line?: number | undefined },
): void {
  if (!location.file) {
    return;
  }

  if (!current.file) {
    if (isDependencyFrame(location.file)) {
      return;
    }
    current.file = location.file;
    current.line = location.line;
    current.column = location.column;
    return;
  }

  if (current.file === location.file) {
    current.line ??= location.line;
    current.column ??= location.column;
  }
}

function isDependencyFrame(file: string): boolean {
  return /(?:^|\/)node_modules\//u.test(file);
}

function updateTestSummary(summary: TestSummary, line: string): void {
  const tapFail = line.match(/^#\s*fail\s+(\d+)$/iu);
  if (tapFail) {
    summary.failed = Number(tapFail[1]);
    return;
  }

  const tapPass = line.match(/^#\s*pass\s+(\d+)$/iu);
  if (tapPass) {
    summary.passed = Number(tapPass[1]);
    return;
  }

  const tapTotal = line.match(/^#\s*tests\s+(\d+)$/iu);
  if (tapTotal) {
    summary.total = Number(tapTotal[1]);
    return;
  }

  if (!/(?:Tests?|Test Files|Test Suites|passed|failed|total)/iu.test(line)) {
    return;
  }

  const failed = line.match(/(\d+)\s+failed/iu);
  if (failed) {
    summary.failed = Number(failed[1]);
  }

  const passed = line.match(/(\d+)\s+passed/iu);
  if (passed) {
    summary.passed = Number(passed[1]);
  }

  const total = line.match(/(\d+)\s+total/iu);
  if (total) {
    summary.total = Number(total[1]);
  }
}

function parsePytestLocation(input: string): {
  file?: string | undefined;
  testName?: string | undefined;
} {
  const [file, ...testParts] = input.split("::");
  return {
    file: file && looksLikePath(file) ? file : undefined,
    testName: testParts.length > 0 ? testParts.join("::") : undefined,
  };
}
