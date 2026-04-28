import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runCommand } from "@pi-setup/shared";

import { buildRepoContext } from "../src/index.js";

test("repo context selects files relevant to the query", async (t) => {
  const tempRoot = await mkdtemp(join(os.tmpdir(), "pi-repo-context-"));
  t.after(() => rm(tempRoot, { force: true, recursive: true }));

  await writeFile(join(tempRoot, "pnpm-workspace.yaml"), "packages:\n  - packages/**\n", "utf8");
  await writeFile(join(tempRoot, "README.md"), "# Demo workspace\n", "utf8");

  await mkdir(join(tempRoot, "packages", "repo-context", "src"), { recursive: true });
  await writeFile(
    join(tempRoot, "packages", "repo-context", "package.json"),
    JSON.stringify(
      {
        description: "Focused repository context snapshots.",
        name: "@demo/repo-context",
      },
      null,
      2,
    ),
    "utf8",
  );
  await writeFile(
    join(tempRoot, "packages", "repo-context", "src", "context.ts"),
    "export const buildRepoContext = () => 'repo context snapshot';\n",
    "utf8",
  );

  await mkdir(join(tempRoot, "packages", "usage-insights", "src"), { recursive: true });
  await writeFile(
    join(tempRoot, "packages", "usage-insights", "package.json"),
    JSON.stringify({ name: "@demo/usage-insights" }, null, 2),
    "utf8",
  );
  await writeFile(
    join(tempRoot, "packages", "usage-insights", "src", "analytics.ts"),
    "export const summarizeUsage = () => 'usage telemetry';\n",
    "utf8",
  );

  const report = await buildRepoContext({
    cwd: join(tempRoot, "packages", "repo-context", "src"),
    maxBytesPerFile: 2_000,
    maxFiles: 4,
    query: "repo context snapshot",
  });

  const selectedPaths = report.selectedFiles.map((file) => file.path);

  assert.equal(report.rootPath, tempRoot);
  assert.equal(
    report.packages.find((pkg) => pkg.path === "packages/repo-context")?.name,
    "@demo/repo-context",
  );
  assert.ok(selectedPaths.includes("packages/repo-context/src/context.ts"));
  assert.ok(selectedPaths.includes("packages/repo-context/package.json"));
  assert.ok(!selectedPaths.includes("packages/usage-insights/src/analytics.ts"));

  const contextFile = report.selectedFiles.find(
    (file) => file.path === "packages/repo-context/src/context.ts",
  );
  assert.match(contextFile?.excerpt ?? "", /1 \| export const buildRepoContext/);
});

test("repo context respects git ignored files when git metadata is available", async (t) => {
  const tempRoot = await mkdtemp(join(os.tmpdir(), "pi-repo-context-git-"));
  t.after(() => rm(tempRoot, { force: true, recursive: true }));

  await writeFile(join(tempRoot, "pnpm-workspace.yaml"), "packages:\n  - packages/**\n", "utf8");
  await writeFile(join(tempRoot, ".gitignore"), "ignored.ts\n", "utf8");
  await mkdir(join(tempRoot, "src"), { recursive: true });
  await writeFile(join(tempRoot, "src", "visible.py"), "print('special needle')\n", "utf8");
  await writeFile(
    join(tempRoot, "ignored.ts"),
    "export const ignored = 'special needle';\n",
    "utf8",
  );

  const gitInit = await runCommand("git", ["init"], { allowFailure: true, cwd: tempRoot });
  if (gitInit.exitCode !== 0) {
    t.skip("git is unavailable");
    return;
  }

  const report = await buildRepoContext({
    cwd: tempRoot,
    maxBytesPerFile: 2_000,
    maxFiles: 10,
    query: "special needle",
  });

  const selectedPaths = report.selectedFiles.map((file) => file.path);

  assert.equal(report.fileSource, "git");
  assert.ok(selectedPaths.includes("src/visible.py"));
  assert.ok(!selectedPaths.includes("ignored.ts"));
});

test("repo context accepts extra text extensions", async (t) => {
  const tempRoot = await mkdtemp(join(os.tmpdir(), "pi-repo-context-extra-"));
  t.after(() => rm(tempRoot, { force: true, recursive: true }));

  await writeFile(join(tempRoot, "pnpm-workspace.yaml"), "packages:\n  - packages/**\n", "utf8");
  await writeFile(join(tempRoot, "workflow.prompt"), "custom prompt snapshot\n", "utf8");

  const report = await buildRepoContext({
    cwd: tempRoot,
    includeExtensions: ["prompt"],
    maxBytesPerFile: 2_000,
    maxFiles: 4,
    query: "custom prompt",
  });

  assert.ok(report.selectedFiles.some((file) => file.path === "workflow.prompt"));
});
