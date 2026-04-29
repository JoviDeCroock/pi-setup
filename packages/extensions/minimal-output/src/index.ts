import { fileURLToPath } from "node:url";

import {
  definePiExtension,
  isBashToolCallEvent,
  isBashToolResultEvent,
  type PiMessageContent,
  type PiToolResultPatch,
} from "@pi-setup/pi-kit";

import { minimizeBashOutput, type MinimizeBashOutputOptions } from "./minimize.js";
import { rewriteTestCommandWithStructuredReporter } from "./reporter-command.js";

export interface MinimalOutputExtensionOptions extends MinimizeBashOutputOptions {
  enabled?: boolean;
  structuredTestReporter?: boolean;
  testReportSummaryCliPath?: string;
}

export function createMinimalOutputExtension(options: MinimalOutputExtensionOptions = {}) {
  return definePiExtension((pi) => {
    pi.on("tool_call", (event, ctx) => {
      if (
        options.enabled === false ||
        options.structuredTestReporter === false ||
        !isBashToolCallEvent(event)
      ) {
        return;
      }

      const decision = rewriteTestCommandWithStructuredReporter(event.input.command, {
        cwd: ctx.cwd,
        summaryCliPath: options.testReportSummaryCliPath ?? defaultTestReportSummaryCliPath(),
      });
      if (decision.status === "rewritten") {
        event.input.command = decision.command;
      }
    });

    pi.on("tool_result", (event): PiToolResultPatch | undefined => {
      if (options.enabled === false || !isBashToolResultEvent(event)) {
        return undefined;
      }

      const originalText = textFromContent(event.content);
      if (!originalText) {
        return undefined;
      }

      const minimizeOptions =
        typeof event.isError === "boolean" ? { ...options, isError: event.isError } : options;
      const decision = minimizeBashOutput(event.input.command, originalText, minimizeOptions);
      if (decision.status !== "minimized") {
        return undefined;
      }

      return {
        content: [{ type: "text", text: decision.text }],
        details: {
          ...objectDetails(event.details),
          minimalOutput: {
            diagnostics: decision.diagnostics.length,
            omittedDiagnostics: decision.omittedDiagnostics,
            originalLength: decision.originalLength,
            originalLineCount: decision.originalLineCount,
            profile: decision.profile,
          },
        },
      };
    });
  });
}

function textFromContent(content: PiMessageContent[]): string | undefined {
  const texts = content.map((part) => part.text).filter((text) => text.length > 0);
  return texts.length > 0 ? texts.join("\n") : undefined;
}

function objectDetails(details: unknown): Record<string, unknown> {
  if (typeof details === "object" && details !== null && !Array.isArray(details)) {
    return details as Record<string, unknown>;
  }
  return {};
}

function defaultTestReportSummaryCliPath(): string {
  return fileURLToPath(new URL("./structured-report-summary.mjs", import.meta.url));
}

const minimalOutputExtension = createMinimalOutputExtension();

export * from "./minimize.js";
export * from "./reporter-command.js";
export * from "./structured-test-report.js";

export default minimalOutputExtension;
