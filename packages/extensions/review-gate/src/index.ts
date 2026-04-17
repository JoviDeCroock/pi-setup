import {
  Type,
  definePiExtension,
  normalizeToolExecutionArgs,
  safeNotify,
  textResult,
} from "@pi-setup/pi-kit";

import { evaluateReviewGate, formatReviewGateReport } from "./gate.js";
import { collectGitChanges } from "./git.js";

export interface ReviewGateToolInput {
  focus?: string;
  maxFiles?: number;
  scope?: "last-commit" | "staged" | "working-tree";
}

const reviewGateExtension = definePiExtension((pi) => {
  pi.registerTool({
    description:
      "Inspect the current git diff and return a review gate summary with warnings for risky patterns and likely follow-up work.",
    name: "review_gate_check",
    parameters: Type.Object({
      focus: Type.Optional(Type.String({ description: "Optional review focus or goal." })),
      maxFiles: Type.Optional(
        Type.Integer({
          description: "Maximum number of changed files to inspect.",
          maximum: 100,
          minimum: 1,
        }),
      ),
      scope: Type.Optional(
        Type.Union([
          Type.Literal("working-tree"),
          Type.Literal("staged"),
          Type.Literal("last-commit"),
        ]),
      ),
    }),
    execute: async (...rawArgs: unknown[]) => {
      const { ctx, params, signal } = normalizeToolExecutionArgs<ReviewGateToolInput>(rawArgs);
      const cwd = ctx?.cwd ?? process.cwd();

      try {
        const changeSet = await collectGitChanges({
          cwd,
          maxFiles: params.maxFiles ?? 40,
          scope: params.scope ?? "working-tree",
          ...(signal ? { signal } : {}),
        });
        const report = evaluateReviewGate({
          changes: changeSet.changes,
          ...(params.focus ? { focus: params.focus } : {}),
        });

        safeNotify(ctx, `Review gate completed with ${report.verdict.toUpperCase()} status.`);

        return textResult(formatReviewGateReport(report, changeSet.rootPath), {
          report,
          rootPath: changeSet.rootPath,
          scope: changeSet.scope,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unexpected review gate failure.";
        safeNotify(ctx, message, "warning");
        return textResult(`review_gate_check could not inspect git changes.\n\n${message}`, {
          error: message,
        });
      }
    },
  });
});

export * from "./gate.js";
export * from "./git.js";

export default reviewGateExtension;
