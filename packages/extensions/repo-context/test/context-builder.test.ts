import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import { join } from "node:path";
import test from "node:test";

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
});
