import assert from "node:assert/strict";
import test from "node:test";

import {
  isPinnedNpmSource,
  parseNpmPackageSource,
  validateDefaultPackagePolicy,
  validatePackageEntries,
} from "../src/index.js";

test("validatePackageEntries requires exact versions for npm package sources", () => {
  const validations = validatePackageEntries([
    { source: "npm:pi-web-access@0.10.6" },
    { source: "npm:pi-subagents" },
    { source: "npm:@tmustier/pi-usage-extension@^0.3.1" },
    { source: "git:github.com/example/repo@v1" },
  ]);

  assert.equal(validations[0]?.ok, true);
  assert.equal(validations[1]?.ok, false);
  assert.equal(validations[2]?.ok, false);
  assert.equal(validations[3]?.ok, true);
});

test("validateDefaultPackagePolicy enforces minimum release age for pinned npm packages", () => {
  const validations = validateDefaultPackagePolicy(
    {
      minimumReleaseAgeDays: 7,
      packages: [
        {
          source: "npm:pi-web-access@0.10.6",
          publishedAt: "2026-04-04T02:14:59.997Z",
        },
        {
          source: "npm:pi-powerline-footer@0.4.18",
          publishedAt: "2026-04-24T06:56:28.996Z",
        },
      ],
    },
    new Date("2026-04-24T07:24:00.000Z"),
  );

  assert.equal(validations[0]?.ok, true);
  assert.equal(validations[1]?.ok, false);
  assert.match(validations[1]?.problems[0] ?? "", /Published on/);
});

test("parseNpmPackageSource handles scoped and unscoped packages", () => {
  assert.deepEqual(parseNpmPackageSource("npm:pi-subagents@0.17.0"), {
    name: "pi-subagents",
    version: "0.17.0",
  });

  assert.deepEqual(parseNpmPackageSource("npm:@tmustier/pi-usage-extension@0.1.5"), {
    name: "@tmustier/pi-usage-extension",
    version: "0.1.5",
  });

  assert.equal(isPinnedNpmSource("npm:@tmustier/pi-usage-extension@0.1.5"), true);
  assert.equal(isPinnedNpmSource("npm:@tmustier/pi-usage-extension"), false);
});
