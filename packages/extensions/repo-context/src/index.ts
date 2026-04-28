import {
  Type,
  definePiExtension,
  normalizeToolExecutionArgs,
  safeNotify,
  textResult,
} from "@pi-setup/pi-kit";

import { buildRepoContext, formatRepoContext } from "./context.js";

export interface RepoContextToolInput {
  includeExtensions?: string[];
  maxBytesPerFile?: number;
  maxFiles?: number;
  query: string;
}

const repoContextExtension = definePiExtension((pi) => {
  pi.registerTool({
    description:
      "Return a focused map of the current repository, including package metadata and line-numbered excerpts from the files most relevant to a query.",
    name: "repo_context_snapshot",
    parameters: Type.Object({
      includeExtensions: Type.Optional(
        Type.Array(Type.String(), {
          description:
            "Additional file extensions to treat as text, with or without a leading dot.",
        }),
      ),
      maxBytesPerFile: Type.Optional(
        Type.Integer({
          description: "Maximum bytes to read from each candidate file.",
          maximum: 12000,
          minimum: 400,
        }),
      ),
      maxFiles: Type.Optional(
        Type.Integer({
          description: "Maximum number of files to include in the report.",
          maximum: 20,
          minimum: 1,
        }),
      ),
      query: Type.String({
        description: "The focus area to search for, such as an extension name, workflow, or bug.",
      }),
    }),
    execute: async (...rawArgs: unknown[]) => {
      const { ctx, params } = normalizeToolExecutionArgs<RepoContextToolInput>(rawArgs);
      const cwd = ctx?.cwd ?? process.cwd();

      try {
        const report = await buildRepoContext({
          cwd,
          ...(params.includeExtensions ? { includeExtensions: params.includeExtensions } : {}),
          maxBytesPerFile: params.maxBytesPerFile ?? 4_000,
          maxFiles: params.maxFiles ?? 8,
          query: params.query,
        });

        safeNotify(ctx, `Repo context snapshot gathered for "${report.query}".`);

        return textResult(formatRepoContext(report), {
          report,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unexpected repo context failure.";
        safeNotify(ctx, message, "warning");
        return textResult(`repo_context_snapshot failed.\n\n${message}`, { error: message });
      }
    },
  });
});

export * from "./context.js";

export default repoContextExtension;
