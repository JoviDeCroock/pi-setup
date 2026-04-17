import assert from "node:assert/strict";
import test from "node:test";

import { evaluateReviewGate } from "../src/index.js";

test("review gate fails on debugger and warns on missing tests", () => {
  const report = evaluateReviewGate({
    changes: [
      {
        additions: 12,
        addedLines: ["debugger;", "console.log('oops');"],
        deletions: 2,
        path: "packages/demo/src/index.ts",
      },
    ],
    focus: "release readiness",
  });

  assert.equal(report.verdict, "fail");
  assert.ok(report.findings.some((finding) => finding.code === "debugger"));
  assert.ok(report.findings.some((finding) => finding.code === "missing-tests"));
});

test("review gate passes for docs-only updates", () => {
  const report = evaluateReviewGate({
    changes: [
      {
        additions: 4,
        addedLines: ["Added another setup example."],
        deletions: 1,
        path: "README.md",
      },
    ],
  });

  assert.equal(report.verdict, "pass");
});
