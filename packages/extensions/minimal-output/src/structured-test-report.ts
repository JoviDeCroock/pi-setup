import path from "node:path";

import { cleanMessage, parseLocationFromLine, splitLines, stripAnsi } from "./common.js";
import { formatDiagnostics } from "./format.js";
import type { Diagnostic, FormatLimits } from "./types.js";

export interface StructuredTestReportOptions {
  cwd?: string | undefined;
  maxDiagnostics?: number | undefined;
  maxMessageLength?: number | undefined;
}

interface StructuredTestCounts {
  failed?: number | undefined;
  passed?: number | undefined;
  pending?: number | undefined;
  success?: boolean | undefined;
  total?: number | undefined;
}

const DEFAULT_MAX_DIAGNOSTICS = 25;
const DEFAULT_MAX_MESSAGE_LENGTH = 180;

export function summarizeStructuredTestReport(
  report: unknown,
  options: StructuredTestReportOptions = {},
): string | undefined {
  const root = asRecord(report);
  if (!root) {
    return undefined;
  }

  const counts = getCounts(root);
  const diagnostics = collectFailureDiagnostics(root, options.cwd);

  if (diagnostics.length === 0 && counts.success === undefined && !hasAnyCount(counts)) {
    return undefined;
  }

  if (diagnostics.length === 0 && counts.success === false) {
    diagnostics.push({ message: getRootFailureMessage(root), severity: "error" });
  }

  const limits: FormatLimits = {
    maxDiagnostics: options.maxDiagnostics ?? DEFAULT_MAX_DIAGNOSTICS,
    maxMessageLength: options.maxMessageLength ?? DEFAULT_MAX_MESSAGE_LENGTH,
  };

  return formatDiagnostics(formatHeader(counts, diagnostics), diagnostics, limits, "failures");
}

function getCounts(root: Record<string, unknown>): StructuredTestCounts {
  const success = typeof root.success === "boolean" ? root.success : asBoolean(root.wasSuccessful);

  return {
    failed: asNumber(root.numFailedTests),
    passed: asNumber(root.numPassedTests),
    pending: asNumber(root.numPendingTests) ?? asNumber(root.numTodoTests),
    success,
    total: asNumber(root.numTotalTests),
  };
}

function collectFailureDiagnostics(
  root: Record<string, unknown>,
  cwd: string | undefined,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const testResults = asArray(root.testResults);

  for (const rawSuite of testResults) {
    const suite = asRecord(rawSuite);
    if (!suite) {
      continue;
    }

    const suiteFile = normalizeFilePath(asString(suite.name) ?? asString(suite.testFilePath), cwd);
    const assertionResults = asArray(suite.assertionResults);

    if (assertionResults.length > 0) {
      diagnostics.push(...collectAssertionDiagnostics(assertionResults, suiteFile, cwd));
      continue;
    }

    if (isFailedStatus(suite.status)) {
      diagnostics.push({
        file: suiteFile,
        message: getSuiteFailureMessage(suite),
        severity: "error",
      });
    }
  }

  return diagnostics;
}

function collectAssertionDiagnostics(
  assertionResults: unknown[],
  suiteFile: string | undefined,
  cwd: string | undefined,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const rawAssertion of assertionResults) {
    const assertion = asRecord(rawAssertion);
    if (!assertion || !isFailedStatus(assertion.status)) {
      continue;
    }

    const failureMessages = asStringArray(assertion.failureMessages);
    const parsedLocation = parseFailureLocation(failureMessages, cwd);
    const locationFromAssertion = asRecord(assertion.location);
    const assertionLine = asNumber(locationFromAssertion?.line);
    const assertionColumn = asNumber(locationFromAssertion?.column);

    diagnostics.push({
      column: parsedLocation?.column ?? assertionColumn,
      file: parsedLocation?.file ?? suiteFile,
      line: parsedLocation?.line ?? assertionLine,
      message: summarizeFailure(assertion, failureMessages),
      severity: "error",
    });
  }

  return diagnostics;
}

function parseFailureLocation(
  failureMessages: string[],
  cwd: string | undefined,
): Pick<Diagnostic, "column" | "file" | "line"> | undefined {
  for (const message of failureMessages) {
    for (const line of splitLines(stripAnsi(message))) {
      const location = parseLocationFromLine(line.trim());
      if (!location?.file || isDependencyFrame(location.file)) {
        continue;
      }
      return {
        column: location.column,
        file: normalizeFilePath(location.file, cwd),
        line: location.line,
      };
    }
  }

  return undefined;
}

function summarizeFailure(assertion: Record<string, unknown>, failureMessages: string[]): string {
  const testName =
    asString(assertion.fullName) ??
    joinAncestorTitle(asStringArray(assertion.ancestorTitles), asString(assertion.title));
  const message = summarizeFailureMessages(failureMessages) ?? asString(assertion.failureMessage);

  if (testName && message && !message.includes(testName)) {
    return `${testName}: ${message}`;
  }

  return message ?? testName ?? "failed test";
}

function summarizeFailureMessages(failureMessages: string[]): string | undefined {
  const selected: string[] = [];

  for (const message of failureMessages) {
    for (const rawLine of splitLines(stripAnsi(message))) {
      const line = cleanMessage(rawLine);
      if (line.length === 0 || shouldIgnoreFailureLine(line)) {
        continue;
      }

      if (
        selected.length === 0 ||
        /^(?:Expected|Received|Actual|Expected value|Received value):/iu.test(line)
      ) {
        selected.push(line);
      }

      if (selected.length >= 4) {
        return selected.join("; ");
      }
    }
  }

  return selected.length > 0 ? selected.join("; ") : undefined;
}

function shouldIgnoreFailureLine(line: string): boolean {
  return (
    /^(?:at\s+|❯\s+)/u.test(line) ||
    /(?:^|\/)node_modules\//u.test(line) ||
    /^[\d\s>|│╵╰╭─~^.-]+$/u.test(line)
  );
}

function getSuiteFailureMessage(suite: Record<string, unknown>): string {
  return (
    summarizeFailureMessages(asStringArray(suite.failureMessage)) ??
    summarizeFailureMessages(asStringArray(suite.message)) ??
    "failed test suite"
  );
}

function getRootFailureMessage(root: Record<string, unknown>): string {
  return (
    summarizeFailureMessages(asStringArray(root.failureMessage)) ??
    summarizeFailureMessages(asStringArray(root.message)) ??
    "test run failed"
  );
}

function formatHeader(counts: StructuredTestCounts, diagnostics: Diagnostic[]): string {
  const failed = counts.failed ?? diagnostics.length;
  const parts = [failed > 0 || counts.success === false ? `${failed || "some"} failed` : "ok"];

  if (counts.passed !== undefined) {
    parts.push(`${counts.passed} passed`);
  }
  if (counts.pending !== undefined && counts.pending > 0) {
    parts.push(`${counts.pending} pending`);
  }
  if (counts.total !== undefined) {
    parts.push(`${counts.total} total`);
  }

  return `test: ${parts.join(", ")}`;
}

function hasAnyCount(counts: StructuredTestCounts): boolean {
  return counts.failed !== undefined || counts.passed !== undefined || counts.total !== undefined;
}

function normalizeFilePath(file: string | undefined, cwd: string | undefined): string | undefined {
  if (!file) {
    return undefined;
  }

  if (!cwd || !path.isAbsolute(file)) {
    return file;
  }

  const relative = path.relative(cwd, file);
  if (relative.length > 0 && !relative.startsWith("..") && !path.isAbsolute(relative)) {
    return relative;
  }

  return file;
}

function joinAncestorTitle(
  ancestorTitles: string[],
  title: string | undefined,
): string | undefined {
  const parts = [...ancestorTitles];
  if (title) {
    parts.push(title);
  }
  return parts.length > 0 ? parts.join(" > ") : undefined;
}

function isFailedStatus(status: unknown): boolean {
  return typeof status === "string" && /^(?:failed|failure|fail|error)$/iu.test(status);
}

function isDependencyFrame(file: string): boolean {
  return /(?:^|\/)node_modules\//u.test(file);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asStringArray(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }

  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}
