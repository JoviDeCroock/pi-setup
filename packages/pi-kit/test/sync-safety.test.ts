import assert from "node:assert/strict";
import { mkdtemp, mkdir, symlink } from "node:fs/promises";
import os from "node:os";
import { join } from "node:path";
import test from "node:test";

import { isSafeManagedAgentPath, pathIsAtOrWithin } from "../src/index.js";

test("isSafeManagedAgentPath accepts files and rejects directory aliases", () => {
  assert.equal(isSafeManagedAgentPath("sol.md"), true);
  assert.equal(isSafeManagedAgentPath("specialists/reviewer.md"), false);
  assert.equal(isSafeManagedAgentPath("."), false);
  assert.equal(isSafeManagedAgentPath("./"), false);
  assert.equal(isSafeManagedAgentPath("./sol.md"), false);
  assert.equal(isSafeManagedAgentPath("specialists//reviewer.md"), false);
  assert.equal(isSafeManagedAgentPath("../outside.md"), false);
  assert.equal(isSafeManagedAgentPath("specialists"), false);
});

test("pathIsAtOrWithin resolves symlink aliases and descendants", async () => {
  const temporaryDirectory = await mkdtemp(join(os.tmpdir(), "pi-sync-safety-"));
  const sourceDirectory = join(temporaryDirectory, "source");
  const aliasDirectory = join(temporaryDirectory, "alias");
  await mkdir(sourceDirectory);
  await symlink(sourceDirectory, aliasDirectory, "dir");

  assert.equal(await pathIsAtOrWithin(aliasDirectory, sourceDirectory), true);
  assert.equal(await pathIsAtOrWithin(join(aliasDirectory, "child"), sourceDirectory), true);
  assert.equal(await pathIsAtOrWithin(temporaryDirectory, sourceDirectory), false);
});
