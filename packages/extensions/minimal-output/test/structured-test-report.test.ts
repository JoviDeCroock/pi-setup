import assert from "node:assert/strict";
import test from "node:test";

import { summarizeStructuredTestReport } from "../src/structured-test-report.js";

test("summarizes Jest/Vitest compatible JSON reports", () => {
  const summary = summarizeStructuredTestReport(
    {
      numFailedTests: 1,
      numPassedTests: 10,
      numTotalTests: 11,
      success: false,
      testResults: [
        {
          assertionResults: [
            {
              ancestorTitles: ["foo"],
              failureMessages: [
                [
                  "AssertionError: expected 1 to equal 2",
                  "Expected: 2",
                  "Received: 1",
                  "    at node_modules/vitest/dist/index.js:123:4",
                  "    at Object.<anonymous> (/repo/src/foo.test.ts:12:3)",
                ].join("\n"),
              ],
              status: "failed",
              title: "handles bar",
            },
          ],
          name: "/repo/src/foo.test.ts",
          status: "failed",
        },
      ],
    },
    { cwd: "/repo" },
  );

  assert.ok(summary);
  assert.match(summary, /^test: 1 failed, 10 passed, 11 total/mu);
  assert.match(summary, /src\/foo\.test\.ts:12:3 error: foo > handles bar/u);
  assert.match(summary, /Expected: 2; Received: 1/u);
  assert.doesNotMatch(summary, /node_modules/u);
});

test("summarizes passing structured reports", () => {
  const summary = summarizeStructuredTestReport({
    numFailedTests: 0,
    numPassedTests: 3,
    numTotalTests: 3,
    success: true,
    testResults: [],
  });

  assert.equal(summary, "test: ok, 3 passed, 3 total");
});

test("surfaces a root failure when no assertion failure is present", () => {
  const summary = summarizeStructuredTestReport({
    message: "No test files found",
    numFailedTests: 0,
    numPassedTests: 0,
    numTotalTests: 0,
    success: false,
    testResults: [],
  });

  assert.ok(summary);
  assert.match(summary, /^test: some failed, 0 passed, 0 total/mu);
  assert.match(summary, /error: No test files found/u);
});
