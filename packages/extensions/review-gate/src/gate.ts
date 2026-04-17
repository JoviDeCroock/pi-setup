export interface ChangedFile {
  additions: number;
  addedLines: string[];
  deletions: number;
  path: string;
}

export interface ReviewGateInput {
  changes: ChangedFile[];
  focus?: string;
}

export interface ReviewGateFinding {
  code: string;
  files: string[];
  message: string;
  severity: "fail" | "warn";
}

export interface ReviewGateReport {
  additions: number;
  changedFiles: number;
  checklist: string[];
  deletions: number;
  findings: ReviewGateFinding[];
  focus?: string;
  verdict: "fail" | "pass" | "warn";
}

const SOURCE_FILE_PATTERN = /\.(c|m)?[jt]sx?$/i;
const TEST_FILE_PATTERN = /(^|\/)(__tests__\/|.*(?:test|spec)\.(c|m)?[jt]sx?$)/i;

export function evaluateReviewGate(input: ReviewGateInput): ReviewGateReport {
  const additions = input.changes.reduce((total, change) => total + change.additions, 0);
  const deletions = input.changes.reduce((total, change) => total + change.deletions, 0);
  const findings: ReviewGateFinding[] = [];

  if (input.changes.length === 0) {
    findings.push({
      code: "no-changes",
      files: [],
      message: "No diff was detected for the selected scope.",
      severity: "warn",
    });
  }

  if (input.changes.length > 30 || additions + deletions > 800) {
    findings.push({
      code: "large-diff",
      files: input.changes.slice(0, 5).map((change) => change.path),
      message:
        "The change set is large enough to deserve a slower review pass or a split into smaller pull requests.",
      severity: "warn",
    });
  }

  const sourceChanges = input.changes.filter(
    (change) => SOURCE_FILE_PATTERN.test(change.path) && !TEST_FILE_PATTERN.test(change.path),
  );
  const testChanges = input.changes.filter((change) => TEST_FILE_PATTERN.test(change.path));

  if (sourceChanges.length > 0 && testChanges.length === 0) {
    findings.push({
      code: "missing-tests",
      files: sourceChanges.slice(0, 5).map((change) => change.path),
      message: "Source files changed without accompanying test updates.",
      severity: "warn",
    });
  }

  pushPatternFinding(findings, input.changes, {
    code: "merge-markers",
    message: "Conflict markers were added to the diff.",
    regex: /^(<{7}|={7}|>{7})$/,
    severity: "fail",
  });

  pushPatternFinding(findings, input.changes, {
    code: "debugger",
    message: "A `debugger` statement was introduced.",
    regex: /\bdebugger\b/,
    severity: "fail",
  });

  pushPatternFinding(findings, input.changes, {
    code: "console-log",
    message: "A `console.log()` call was introduced. Confirm it should remain in committed code.",
    regex: /\bconsole\.log\s*\(/,
    severity: "warn",
  });

  pushPatternFinding(findings, input.changes, {
    code: "todo",
    message: "A `TODO` or `FIXME` marker was introduced.",
    regex: /\b(?:TODO|FIXME)\b/,
    severity: "warn",
  });

  const verdict = findings.some((finding) => finding.severity === "fail")
    ? "fail"
    : findings.length > 0
      ? "warn"
      : "pass";

  const checklist = buildChecklist({ findings, hasSourceChanges: sourceChanges.length > 0 });

  return {
    additions,
    changedFiles: input.changes.length,
    checklist,
    deletions,
    findings,
    ...(input.focus ? { focus: input.focus } : {}),
    verdict,
  };
}

export function formatReviewGateReport(report: ReviewGateReport, rootPath?: string): string {
  const lines = [
    "# Review Gate",
    "",
    `Verdict: **${report.verdict.toUpperCase()}**`,
    `Changed files: ${report.changedFiles}`,
    `Line delta: +${report.additions} / -${report.deletions}`,
  ];

  if (rootPath) {
    lines.push(`Workspace root: \`${rootPath}\``);
  }

  if (report.focus) {
    lines.push(`Focus: ${report.focus}`);
  }

  lines.push("");

  if (report.findings.length === 0) {
    lines.push("No blocking or warning-level findings were detected for the selected scope.");
  } else {
    lines.push("## Findings", "");

    for (const finding of report.findings) {
      const fileSuffix =
        finding.files.length > 0
          ? ` (${finding.files.map((file) => `\`${file}\``).join(", ")})`
          : "";
      lines.push(`- [${finding.severity.toUpperCase()}] ${finding.message}${fileSuffix}`);
    }
  }

  if (report.checklist.length > 0) {
    lines.push("", "## Next checks", "");
    lines.push(...report.checklist.map((item) => `- ${item}`));
  }

  return lines.join("\n");
}

function buildChecklist(input: {
  findings: ReviewGateFinding[];
  hasSourceChanges: boolean;
}): string[] {
  const checklist = new Set<string>();

  if (input.hasSourceChanges) {
    checklist.add("Run `pnpm verify` before merging.");
  }

  if (input.findings.some((finding) => finding.code === "missing-tests")) {
    checklist.add("Add or update tests for the touched source files.");
  }

  if (input.findings.some((finding) => finding.code === "large-diff")) {
    checklist.add("Consider splitting the change set or reviewing it in smaller slices.");
  }

  if (input.findings.some((finding) => finding.severity === "fail")) {
    checklist.add("Resolve fail-level findings before treating the change set as merge-ready.");
  }

  return Array.from(checklist);
}

function pushPatternFinding(
  findings: ReviewGateFinding[],
  changes: ChangedFile[],
  options: {
    code: string;
    message: string;
    regex: RegExp;
    severity: "fail" | "warn";
  },
): void {
  const matchedFiles = changes
    .filter((change) => change.addedLines.some((line) => options.regex.test(line.trim())))
    .map((change) => change.path);

  if (matchedFiles.length === 0) {
    return;
  }

  findings.push({
    code: options.code,
    files: matchedFiles,
    message: options.message,
    severity: options.severity,
  });
}
