import assert from "node:assert/strict";
import test from "node:test";

import {
  interpretRtkRewriteResult,
  rewriteCommandWithRtk,
  shouldDeferToMinimalOutput,
  shouldDeferToStructuredTestReporter,
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

test("structured test reporter deferral recognizes direct and package-script Vitest/Jest", () => {
  assert.equal(shouldDeferToStructuredTestReporter("vitest run"), true);
  assert.equal(shouldDeferToStructuredTestReporter("npx jest"), true);
  assert.equal(
    shouldDeferToStructuredTestReporter("pnpm test", {
      packageScripts: { test: "vitest run" },
    }),
    true,
  );
  assert.equal(
    shouldDeferToStructuredTestReporter("pnpm test", {
      packageScripts: { test: "turbo run test" },
    }),
    false,
  );
  assert.equal(shouldDeferToStructuredTestReporter("vitest --watch"), false);
  assert.equal(shouldDeferToStructuredTestReporter("vitest run --reporter=verbose"), false);
});

test("minimal-output deferral recognizes diagnostic package scripts", () => {
  assert.equal(shouldDeferToMinimalOutput("pnpm lint"), true);
  assert.equal(shouldDeferToMinimalOutput("pnpm typecheck"), true);
  assert.equal(
    shouldDeferToMinimalOutput("pnpm test", { packageScripts: { test: "vitest run" } }),
    true,
  );
  assert.equal(
    shouldDeferToMinimalOutput("pnpm test", { packageScripts: { test: "turbo run test" } }),
    false,
  );
  assert.equal(shouldDeferToMinimalOutput("tsc --noEmit"), true);
  assert.equal(shouldDeferToMinimalOutput("grep -R foo ."), false);
  assert.equal(shouldDeferToMinimalOutput("git status --short"), false);
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
