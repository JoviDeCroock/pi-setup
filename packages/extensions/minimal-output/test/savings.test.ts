import assert from "node:assert/strict";
import test from "node:test";

import {
  createSavingsPoint,
  formatSavingsSummary,
  savingsPointsFromEntries,
  summarizeSavings,
} from "../src/savings.js";

test("summarizes minimal-output savings points", () => {
  const point = createSavingsPoint("pnpm typecheck", {
    diagnostics: [
      {
        message: "Type 'string' is not assignable to type 'number'.",
        severity: "error",
      },
    ],
    omittedDiagnostics: 0,
    originalLength: 400,
    originalLineCount: 20,
    profile: "tsc",
    text: "tsc: 1 error\n- src/index.ts:1:2 error TS2322: nope",
  });

  assert.equal(point.savedLength, 350);
  assert.equal(point.savedLineCount, 18);
  assert.equal(point.estimatedTokensSaved, 88);

  const summary = summarizeSavings([point]);
  assert.equal(summary.pointCount, 1);
  assert.equal(summary.totalSavedLength, 350);
  assert.equal(summary.byProfile.tsc?.pointCount, 1);
  assert.match(formatSavingsSummary(summary), /^minimal-output savings: 1 compacted Bash result/mu);
  assert.match(formatSavingsSummary(summary), /estimated tokens saved: ~88/u);
});

test("loads savings points from session entries", () => {
  const point = createSavingsPoint("pnpm lint", {
    diagnostics: [],
    omittedDiagnostics: 0,
    originalLength: 100,
    originalLineCount: 10,
    profile: "lint",
    text: "lint: ok",
  });

  assert.deepEqual(
    savingsPointsFromEntries([
      { customType: "other", data: point },
      { customType: "minimal-output-savings", data: point },
    ]),
    [point],
  );
});
