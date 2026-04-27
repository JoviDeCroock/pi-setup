import assert from "node:assert/strict";
import test from "node:test";

import { renderAgentsTemplateText } from "../src/index.js";

test("renderAgentsTemplateText omits optional vault guidance without a configured vault", () => {
  const rendered = renderAgentsTemplateText({
    template: [
      "- Always-on guidance",
      "<!-- pi:if-vault -->",
      "",
      "- Optional: write to `<VAULT>/00-inbox/` only after opt-in.",
      "<!-- /pi:if-vault -->",
      "- More always-on guidance",
      "",
    ].join("\n"),
  });

  assert.equal(rendered, ["- Always-on guidance", "- More always-on guidance", ""].join("\n"));
});

test("renderAgentsTemplateText includes optional vault guidance with the configured vault", () => {
  const rendered = renderAgentsTemplateText({
    template: [
      "- Always-on guidance",
      "  <!-- pi:if-vault -->",
      "",
      "- Optional: write to `<VAULT>/00-inbox/` only after opt-in.",
      "<!-- /pi:if-vault -->",
      "- More always-on guidance",
      "",
    ].join("\n"),
    vault: "/Users/example/Notes",
  });

  assert.equal(
    rendered,
    [
      "- Always-on guidance",
      "- Optional: write to `/Users/example/Notes/00-inbox/` only after opt-in.",
      "- More always-on guidance",
      "",
    ].join("\n"),
  );
});

test("renderAgentsTemplateText rejects unguarded vault placeholders", () => {
  assert.throws(
    () =>
      renderAgentsTemplateText({
        template: "- Write to `<VAULT>/00-inbox/`.\n",
      }),
    /still contains <VAULT>/u,
  );
});
