import assert from "node:assert/strict";
import test from "node:test";

import { classifyDiagnosticCommand, minimizeBashOutput } from "../src/minimize.js";

test("classifies supported diagnostic commands", () => {
  assert.equal(classifyDiagnosticCommand("pnpm typecheck"), "tsc");
  assert.equal(classifyDiagnosticCommand("npx tsc --noEmit"), "tsc");
  assert.equal(classifyDiagnosticCommand("pnpm lint"), "lint");
  assert.equal(classifyDiagnosticCommand("npm run lint"), "lint");
  assert.equal(classifyDiagnosticCommand("pnpm test"), "test");
  assert.equal(classifyDiagnosticCommand("vitest run"), "test");
  assert.equal(classifyDiagnosticCommand("pnpm build"), "build");
  assert.equal(classifyDiagnosticCommand("vite build"), "build");
  assert.equal(classifyDiagnosticCommand("pnpm install"), "package-manager");
  assert.equal(classifyDiagnosticCommand("git status"), undefined);
});

test("minimizes compact tsc diagnostics", () => {
  const decision = minimizeBashOutput(
    "pnpm typecheck",
    [
      "src/index.ts(12,34): error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.",
      "src/index.ts(20,3): error TS2322: Type 'undefined' is not assignable to type 'string'.",
      "Found 2 errors in the same file, starting at: src/index.ts:12",
    ].join("\n"),
  );

  assert.equal(decision.status, "minimized");
  assert.match(decision.text, /^tsc: 2 errors/mu);
  assert.match(decision.text, /src\/index\.ts:12:34 error TS2345:/u);
  assert.doesNotMatch(decision.text, /Found 2 errors in the same file/u);
});

test("minimizes pretty tsc diagnostics", () => {
  const decision = minimizeBashOutput(
    "tsc --pretty true",
    [
      "src/app.ts:4:7 - error TS2322: Type 'string' is not assignable to type 'number'.",
      "",
      "4 const count: number = '1';",
      "        ~~~~~",
    ].join("\n"),
  );

  assert.equal(decision.status, "minimized");
  assert.equal(decision.diagnostics.length, 1);
  assert.match(decision.text, /src\/app\.ts:4:7 error TS2322/u);
  assert.doesNotMatch(decision.text, /~~~~~/u);
});

test("minimizes eslint stylish output", () => {
  const decision = minimizeBashOutput(
    "pnpm lint",
    [
      "/work/src/app.ts",
      "  10:5  error    'unused' is assigned a value but never used  no-unused-vars",
      "  12:1  warning  Unexpected console statement                 no-console",
      "",
      "✖ 2 problems (1 error, 1 warning)",
    ].join("\n"),
  );

  assert.equal(decision.status, "minimized");
  assert.match(decision.text, /^lint: 1 error, 1 warning/mu);
  assert.match(decision.text, /\/work\/src\/app\.ts:10:5 error no-unused-vars:/u);
  assert.match(decision.text, /\/work\/src\/app\.ts:12:1 warning no-console:/u);
});

test("limits shown diagnostics", () => {
  const output = Array.from({ length: 3 }, (_, index) =>
    [
      `src/${index}.ts(${index + 1},1): error TS1000: Message ${index}`,
      `  const value${index}: number = "${index}";`,
      "        ~~~~~",
      "This extra explanatory line should be removed.",
    ].join("\n"),
  ).join("\n");

  const decision = minimizeBashOutput("tsc", output, { maxDiagnostics: 2 });

  assert.equal(decision.status, "minimized");
  assert.equal(decision.omittedDiagnostics, 1);
  assert.match(decision.text, /… 1 more diagnostics omitted/u);
});

test("minimizes test runner failures", () => {
  const decision = minimizeBashOutput(
    "pnpm test",
    [
      " RUN  v1.0.0 /repo",
      " FAIL  src/foo.test.ts > foo > handles bar",
      "AssertionError: expected 1 to equal 2",
      "Expected: 2",
      "Received: 1",
      " ❯ node_modules/vitest/dist/index.js:123:4",
      " ❯ src/foo.test.ts:12:3",
      " Test Files  1 failed | 2 passed (3)",
      "      Tests  1 failed | 10 passed (11)",
    ].join("\n"),
    { isError: true },
  );

  assert.equal(decision.status, "minimized");
  assert.match(decision.text, /^test: 1 failed, 10 passed/mu);
  assert.match(decision.text, /src\/foo\.test\.ts:12:3 error: foo > handles bar/u);
  assert.doesNotMatch(decision.text, /node_modules/u);
});

test("preserves structured reporter summaries when result minimization runs", () => {
  const decision = minimizeBashOutput(
    "__pi_minimal_output_report=...; vitest run --reporter=json; exit $__pi_minimal_output_status",
    [
      "test: 1 failed, 2 passed, 3 total",
      "- src/foo.test.ts:12:3 error: foo handles bar: expected 1 to equal 2",
      "structured test report: /tmp/pi-minimal-output-vitest-abcd",
    ].join("\n"),
    { isError: true },
  );

  assert.equal(decision.status, "minimized");
  assert.match(decision.text, /^test: 1 failed, 2 passed, 3 total/mu);
  assert.match(decision.text, /src\/foo\.test\.ts:12:3 error: foo handles bar/u);
});

test("minimizes build failures", () => {
  const decision = minimizeBashOutput(
    "pnpm build",
    [
      "vite v5.0.0 building for production...",
      "transforming...",
      "✓ 120 modules transformed.",
      "src/index.ts:10:5: ERROR: Could not resolve './missing'",
      "    10 │ import './missing'",
      "       ╵        ~~~~~~~~~~~",
      "error during build:",
      "RollupError: Could not resolve './missing' from src/index.ts",
    ].join("\n"),
    { isError: true },
  );

  assert.equal(decision.status, "minimized");
  assert.match(decision.text, /^build: failed/mu);
  assert.match(decision.text, /src\/index\.ts:10:5 error: Could not resolve/u);
  assert.doesNotMatch(decision.text, /modules transformed/u);
});

test("minimizes package manager failures", () => {
  const decision = minimizeBashOutput(
    "pnpm install",
    [
      "Progress: resolved 1, reused 0, downloaded 0, added 0",
      "Progress: resolved 120, reused 100, downloaded 0, added 0",
      "WARN deprecated left-pad@1.3.0: use String.prototype.padStart()",
      "ERR_PNPM_PEER_DEP_ISSUES Unmet peer dependencies",
      "Packages: +10 -2",
      "Done in 1.2s",
    ].join("\n"),
    { isError: true },
  );

  assert.equal(decision.status, "minimized");
  assert.match(decision.text, /^pkg: failed, 1 error, 1 warning/mu);
  assert.match(decision.text, /warning: WARN deprecated left-pad/u);
  assert.match(decision.text, /error: ERR_PNPM_PEER_DEP_ISSUES/u);
  assert.doesNotMatch(decision.text, /Progress:/u);
});

test("leaves unsupported or unparseable output unchanged", () => {
  assert.equal(minimizeBashOutput("git status", "lots of output").status, "unchanged");
  assert.equal(
    minimizeBashOutput("pnpm lint", "Something failed before diagnostics").status,
    "unchanged",
  );
});
