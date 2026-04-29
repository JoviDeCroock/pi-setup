import assert from "node:assert/strict";
import test from "node:test";

import { classifyDiagnosticCommand, minimizeBashOutput } from "../src/minimize.js";

test("classifies tsc and lint commands", () => {
  assert.equal(classifyDiagnosticCommand("pnpm typecheck"), "tsc");
  assert.equal(classifyDiagnosticCommand("npx tsc --noEmit"), "tsc");
  assert.equal(classifyDiagnosticCommand("pnpm lint"), "lint");
  assert.equal(classifyDiagnosticCommand("npm run lint"), "lint");
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
  const output = Array.from(
    { length: 3 },
    (_, index) => `src/${index}.ts(${index + 1},1): error TS1000: Message ${index}`,
  ).join("\n");

  const decision = minimizeBashOutput("tsc", output, { maxDiagnostics: 2 });

  assert.equal(decision.status, "minimized");
  assert.equal(decision.omittedDiagnostics, 1);
  assert.match(decision.text, /… 1 more diagnostics omitted/u);
});

test("leaves unsupported or unparseable output unchanged", () => {
  assert.equal(minimizeBashOutput("git status", "lots of output").status, "unchanged");
  assert.equal(
    minimizeBashOutput("pnpm lint", "Something failed before diagnostics").status,
    "unchanged",
  );
});
