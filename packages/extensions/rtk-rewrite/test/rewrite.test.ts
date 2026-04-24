import assert from "node:assert/strict";
import test from "node:test";

import {
  interpretRtkRewriteResult,
  rewriteCommandWithRtk,
  type RtkCommandRunner,
} from "../src/index.js";

test("interpretRtkRewriteResult accepts successful rewrites", () => {
  const decision = interpretRtkRewriteResult("git status", {
    exitCode: 0,
    stderr: "",
    stdout: "rtk git status\n",
  });

  assert.equal(decision.status, "rewritten");
  assert.equal(decision.command, "rtk git status");
});

test("interpretRtkRewriteResult accepts ask/default rewrites", () => {
  const decision = interpretRtkRewriteResult("cargo test", {
    exitCode: 3,
    stderr: "",
    stdout: "rtk cargo test",
  });

  assert.equal(decision.status, "rewritten");
  assert.equal(decision.command, "rtk cargo test");
});

test("interpretRtkRewriteResult treats unsupported commands as unchanged", () => {
  const decision = interpretRtkRewriteResult("htop", {
    exitCode: 1,
    stderr: "",
    stdout: "",
  });

  assert.equal(decision.status, "unchanged");
  assert.equal(decision.command, "htop");
  assert.equal(decision.reason, "no-rtk-equivalent");
});

test("interpretRtkRewriteResult detects missing rtk binary", () => {
  const decision = interpretRtkRewriteResult("git status", {
    exitCode: 1,
    stderr: "spawn rtk ENOENT",
    stdout: "",
  });

  assert.equal(decision.status, "unavailable");
  assert.equal(decision.command, "git status");
});

test("rewriteCommandWithRtk shells out with the original command as one argument", async () => {
  const calls: Array<{ args: string[]; command: string }> = [];
  const runner: RtkCommandRunner = async (command, args) => {
    calls.push({ args, command });
    return {
      exitCode: 0,
      stderr: "",
      stdout: "rtk git status --short\n",
    };
  };

  const decision = await rewriteCommandWithRtk("git status --short", { runner });

  assert.equal(decision.status, "rewritten");
  assert.equal(decision.command, "rtk git status --short");
  assert.deepEqual(calls, [{ args: ["rewrite", "git status --short"], command: "rtk" }]);
});
