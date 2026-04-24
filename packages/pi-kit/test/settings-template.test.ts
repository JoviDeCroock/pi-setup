import assert from "node:assert/strict";
import test from "node:test";

import { mergeJsonObjects, renderSettingsTemplateText, stringEnum } from "../src/index.js";

test("renderSettingsTemplateText injects package defaults and private overlays", () => {
  const rendered = renderSettingsTemplateText({
    defaultPackages: [
      {
        publishedAt: "2026-04-04T02:14:59.997Z",
        source: "npm:pi-web-access@0.10.6",
      },
    ],
    overlay: {
      "pi-memory-md": {
        enabled: true,
        repoUrl: "git@github.com:demo/memory.git",
      },
    },
    template: JSON.stringify(
      {
        extensions: ["__PI_SETUP_ROOT__/dist/index.mjs"],
        packages: "__PI_SETUP_DEFAULT_PACKAGES__",
        "pi-memory-md": {
          enabled: false,
          injection: "message-append",
          repoUrl: "",
        },
      },
      null,
      2,
    ),
    workspaceRoot: "/repo",
  });

  const settings = JSON.parse(rendered) as {
    extensions: string[];
    packages: Array<{ publishedAt?: string; source: string }>;
    "pi-memory-md": { enabled: boolean; injection: string; repoUrl: string };
  };

  assert.deepEqual(settings.extensions, ["/repo/dist/index.mjs"]);
  assert.deepEqual(settings.packages, [{ source: "npm:pi-web-access@0.10.6" }]);
  assert.equal(settings["pi-memory-md"].enabled, true);
  assert.equal(settings["pi-memory-md"].injection, "message-append");
  assert.equal(settings["pi-memory-md"].repoUrl, "git@github.com:demo/memory.git");
});

test("mergeJsonObjects deep-merges objects and replaces arrays", () => {
  assert.deepEqual(
    mergeJsonObjects(
      {
        nested: { keep: true, replace: ["old"] },
      },
      {
        nested: { replace: ["new"] },
      },
    ),
    {
      nested: { keep: true, replace: ["new"] },
    },
  );
});

test("stringEnum emits a plain string enum schema", () => {
  const schema = stringEnum(["all", "staged"], { description: "scope" }) as {
    description?: string;
    enum?: string[];
    type?: string;
  };

  assert.equal(schema.description, "scope");
  assert.deepEqual(schema.enum, ["all", "staged"]);
  assert.equal(schema.type, "string");
});
