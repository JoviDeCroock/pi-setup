#!/usr/bin/env node
import { readFileSync } from "node:fs";

import { summarizeStructuredTestReport } from "./structured-test-report.js";

function main(argv: string[]): void {
  const reportPath = lastPositionalArgument(argv);
  if (!reportPath) {
    console.log("test: structured report unavailable (missing report path)");
    return;
  }

  const raw = readReport(reportPath);
  if (!raw) {
    return;
  }

  const report = parseReport(raw, reportPath);
  if (!report) {
    return;
  }

  const summary = summarizeStructuredTestReport(report, { cwd: process.cwd() });
  console.log(summary ?? "test: structured report contained no recognizable results");
}

function lastPositionalArgument(argv: string[]): string | undefined {
  for (let index = argv.length - 1; index >= 0; index -= 1) {
    const argument = argv[index];
    if (argument && !argument.startsWith("--")) {
      return argument;
    }
  }
  return undefined;
}

function readReport(reportPath: string): string | undefined {
  try {
    return readFileSync(reportPath, "utf8");
  } catch (error) {
    console.log(`test: structured report unavailable (${messageFromError(error)})`);
    return undefined;
  }
}

function parseReport(raw: string, reportPath: string): unknown | undefined {
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.log(
      `test: could not parse structured report ${reportPath} (${messageFromError(error)})`,
    );
    return undefined;
  }
}

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

main(process.argv.slice(2));
