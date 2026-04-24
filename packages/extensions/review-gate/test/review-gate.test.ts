import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { collectGitChanges, evaluateReviewGate } from "../src/index.js";

const execFileAsync = promisify(execFile);

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

test("review gate fails on conflict markers with branch suffixes", () => {
  const report = evaluateReviewGate({
    changes: [
      {
        additions: 1,
        addedLines: ["<<<<<<< HEAD"],
        deletions: 0,
        path: "packages/demo/src/index.ts",
      },
    ],
  });

  assert.equal(report.verdict, "fail");
  assert.ok(report.findings.some((finding) => finding.code === "merge-markers"));
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

test("collectGitChanges all scope includes staged and untracked files", async () => {
  const tempRoot = await mkdtemp(join(os.tmpdir(), "pi-review-gate-"));
  const git = async (args: string[]) => execFileAsync("git", args, { cwd: tempRoot });

  await git(["init"]);
  await git(["config", "user.email", "test@example.com"]);
  await git(["config", "user.name", "Test User"]);
  await mkdir(join(tempRoot, "src"), { recursive: true });
  await writeFile(join(tempRoot, "src", "tracked.ts"), "export const value = 1;\n", "utf8");
  await git(["add", "."]);
  await git(["commit", "-m", "initial"]);

  await writeFile(join(tempRoot, "src", "tracked.ts"), "console.log('staged');\n", "utf8");
  await git(["add", "src/tracked.ts"]);
  await writeFile(join(tempRoot, "src", "untracked.ts"), "<<<<<<< HEAD\n", "utf8");

  const changeSet = await collectGitChanges({
    cwd: tempRoot,
    maxFiles: 10,
    scope: "all",
  });

  assert.ok(changeSet.changes.some((change) => change.path === "src/tracked.ts"));
  assert.ok(changeSet.changes.some((change) => change.path === "src/untracked.ts"));

  const report = evaluateReviewGate({ changes: changeSet.changes });
  assert.equal(report.verdict, "fail");
  assert.ok(report.findings.some((finding) => finding.code === "merge-markers"));
});
