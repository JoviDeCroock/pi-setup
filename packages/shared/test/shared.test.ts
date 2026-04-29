import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  excerptMatchingLines,
  excerptMatchingLinesWithLineNumbers,
  findWorkspaceRoot,
  parseJsonLines,
  scoreTextAgainstQuery,
  tokenizeQuery,
} from "../src/index.js";

test("parseJsonLines skips blanks and parses values", () => {
  const parsed = parseJsonLines<{ id: number }>('\n{"id":1}\n{"id":2}\n');
  assert.deepEqual(
    parsed.map((line) => line.value.id),
    [1, 2],
  );
});

test("tokenizeQuery keeps stable lowercase tokens", () => {
  assert.deepEqual(tokenizeQuery("Alpha Feature alpha-feature"), [
    "alpha",
    "feature",
    "alpha-feature",
  ]);
});

test("excerptMatchingLines favors matching lines", () => {
  const excerpt = excerptMatchingLines("alpha\nbravo\ncharlie delta\necho", ["delta"], 2);
  assert.match(excerpt, /charlie delta/);
});

test("excerptMatchingLinesWithLineNumbers includes original line numbers", () => {
  const excerpt = excerptMatchingLinesWithLineNumbers(
    "alpha\nbravo\ncharlie delta\necho",
    ["delta"],
    3,
  );
  assert.match(excerpt, /2 \| bravo/);
  assert.match(excerpt, /3 \| charlie delta/);
});

test("scoreTextAgainstQuery matches separator variants", () => {
  assert.ok(scoreTextAgainstQuery("alpha feature summary", ["alpha-feature"]) > 0);
});

test("findWorkspaceRoot walks upward to a marker", async () => {
  const tempRoot = await mkdtemp(join(os.tmpdir(), "pi-setup-shared-"));
  const nestedPath = join(tempRoot, "packages", "demo");
  await mkdir(nestedPath, { recursive: true });
  await writeFile(join(tempRoot, "pnpm-workspace.yaml"), "packages:\n  - packages/**\n", "utf8");
  await writeFile(join(tempRoot, "packages", "demo", "package.json"), '{"name":"demo"}\n', "utf8");

  const root = await findWorkspaceRoot(nestedPath);
  assert.equal(root, tempRoot);
});
