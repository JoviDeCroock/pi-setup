import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildRepoContext } from "../src/index.js";

test("repo context selects files relevant to the query", async () => {
  const tempRoot = await mkdtemp(join(os.tmpdir(), "pi-repo-context-"));
  await writeFile(join(tempRoot, "pnpm-workspace.yaml"), "packages:\n  - packages/**\n", "utf8");
  await writeFile(join(tempRoot, "README.md"), "# Demo workspace\n", "utf8");
  await mkdir(join(tempRoot, "packages", "review-gate", "src"), { recursive: true });
  await writeFile(
    join(tempRoot, "packages", "review-gate", "package.json"),
    JSON.stringify({ name: "@demo/review-gate" }, null, 2),
    "utf8",
  );
  await writeFile(
    join(tempRoot, "packages", "review-gate", "src", "index.ts"),
    "export const reviewGate = () => 'review gate';\n",
    "utf8",
  );

  const report = await buildRepoContext({
    cwd: join(tempRoot, "packages", "review-gate"),
    maxBytesPerFile: 2_000,
    maxFiles: 4,
    query: "review gate",
  });

  assert.equal(report.packages[0]?.name, "@demo/review-gate");
  assert.ok(report.selectedFiles.some((file) => file.path.includes("review-gate/src/index.ts")));
});
