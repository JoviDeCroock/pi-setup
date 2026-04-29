import assert from "node:assert/strict";
import test from "node:test";

import { rewriteTestCommandWithStructuredReporter } from "../src/reporter-command.js";

const summaryCliPath = "/tmp/pi minimal output/structured-report-summary.mjs";

test("rewrites vitest run commands to use a structured reporter", () => {
  const decision = rewriteTestCommandWithStructuredReporter(
    "pnpm exec vitest run src/foo.test.ts",
    {
      summaryCliPath,
    },
  );

  assert.equal(decision.status, "rewritten");
  assert.equal(decision.runner, "vitest");
  assert.match(decision.command, /--reporter=json/u);
  assert.match(decision.command, /--silent=passed-only/u);
  assert.match(decision.command, /--outputFile="\$__pi_minimal_output_report"/u);
  assert.match(
    decision.command,
    /node '\/tmp\/pi minimal output\/structured-report-summary\.mjs'/u,
  );
  assert.match(decision.command, /structured test report: \$__pi_minimal_output_report/u);
  assert.match(decision.command, /exit \$__pi_minimal_output_status/u);
});

test("rewrites package test scripts when they run Vitest directly", () => {
  const decision = rewriteTestCommandWithStructuredReporter("pnpm test", {
    packageScripts: { test: "vitest run" },
    summaryCliPath,
  });

  assert.equal(decision.status, "rewritten");
  assert.equal(decision.runner, "vitest");
  assert.match(decision.command, /pnpm test -- --reporter=json/u);
  assert.match(decision.command, /--silent=passed-only/u);
  assert.match(decision.command, /--outputFile="\$__pi_minimal_output_report"/u);
});

test("rewrites package test scripts when they run Jest directly", () => {
  const decision = rewriteTestCommandWithStructuredReporter("npm test", {
    packageScripts: { test: "jest" },
    summaryCliPath,
  });

  assert.equal(decision.status, "rewritten");
  assert.equal(decision.runner, "jest");
  assert.match(decision.command, /npm test -- --json/u);
  assert.match(decision.command, /--outputFile="\$__pi_minimal_output_report"/u);
});

test("does not rewrite package test scripts behind another runner", () => {
  const decision = rewriteTestCommandWithStructuredReporter("pnpm test", {
    packageScripts: { test: "turbo run test" },
    summaryCliPath,
  });

  assert.equal(decision.status, "unchanged");
  assert.equal(decision.reason, "unsupported-package-script-runner");
});

test("rewrites jest commands to use JSON output", () => {
  const decision = rewriteTestCommandWithStructuredReporter("npx jest src/foo.test.ts", {
    summaryCliPath,
  });

  assert.equal(decision.status, "rewritten");
  assert.equal(decision.runner, "jest");
  assert.match(decision.command, /--json/u);
  assert.match(decision.command, /--outputFile="\$__pi_minimal_output_report"/u);
});

test("preserves explicit Vitest silent options", () => {
  const decision = rewriteTestCommandWithStructuredReporter("vitest run --silent=false", {
    summaryCliPath,
  });

  assert.equal(decision.status, "rewritten");
  assert.doesNotMatch(decision.command, /--silent=passed-only/u);
  assert.match(decision.command, /--silent=false/u);
});

test("leaves explicit reporters, watch commands, and complex shell unchanged", () => {
  assert.equal(
    rewriteTestCommandWithStructuredReporter("vitest run --reporter=verbose", { summaryCliPath })
      .status,
    "unchanged",
  );
  assert.equal(
    rewriteTestCommandWithStructuredReporter("vitest --watch", { summaryCliPath }).status,
    "unchanged",
  );
  assert.equal(
    rewriteTestCommandWithStructuredReporter("vitest run && echo done", { summaryCliPath }).status,
    "unchanged",
  );
});

test("leaves vitest default watch mode unchanged", () => {
  assert.equal(
    rewriteTestCommandWithStructuredReporter("vitest src/foo.test.ts", { summaryCliPath }).status,
    "unchanged",
  );
});
