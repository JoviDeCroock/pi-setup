import { fileURLToPath } from "node:url";

import {
  appendSessionEntry,
  definePiExtension,
  getSessionEntries,
  isBashToolCallEvent,
  isBashToolResultEvent,
  safeNotify,
  type PiMessageContent,
  type PiToolResultPatch,
} from "@pi-setup/pi-kit";

import { minimizeBashOutput, type MinimizeBashOutputOptions } from "./minimize.js";
import { rewriteTestCommandWithStructuredReporter } from "./reporter-command.js";
import {
  MINIMAL_OUTPUT_SAVINGS_ENTRY_TYPE,
  createSavingsPoint,
  formatSavingsSummary,
  savingsPointsFromEntries,
  summarizeSavings,
  type MinimalOutputSavingsPoint,
} from "./savings.js";

export interface MinimalOutputExtensionOptions extends MinimizeBashOutputOptions {
  enabled?: boolean;
  logSavings?: boolean;
  structuredTestReporter?: boolean;
  testReportSummaryCliPath?: string;
}

export function createMinimalOutputExtension(options: MinimalOutputExtensionOptions = {}) {
  return definePiExtension((pi) => {
    const liveSavings: MinimalOutputSavingsPoint[] = [];

    pi.on("session_start", () => {
      liveSavings.length = 0;
    });

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

      const savingsPoint = createSavingsPoint(event.input.command, decision);
      if (options.logSavings !== false) {
        liveSavings.push(savingsPoint);
        appendSessionEntry(pi, MINIMAL_OUTPUT_SAVINGS_ENTRY_TYPE, savingsPoint);
      }

      return {
        content: [{ type: "text", text: decision.text }],
        details: {
          ...objectDetails(event.details),
          minimalOutput: {
            diagnostics: decision.diagnostics.length,
            omittedDiagnostics: decision.omittedDiagnostics,
            minimizedLength: savingsPoint.minimizedLength,
            minimizedLineCount: savingsPoint.minimizedLineCount,
            originalLength: decision.originalLength,
            originalLineCount: decision.originalLineCount,
            profile: decision.profile,
            savedLength: savingsPoint.savedLength,
            savedLineCount: savingsPoint.savedLineCount,
          },
        },
      };
    });

    pi.registerCommand?.("minimal-output-savings", {
      description:
        "Report how much Bash output the minimal-output extension has removed from this session.",
      handler: (args, ctx) => {
        const limit = parseSavingsLimit(args);
        let points = savingsPointsFromEntries(getSessionEntries(ctx));
        if (points.length === 0) {
          points = [...liveSavings];
        }
        if (limit) {
          points = points.slice(-limit);
        }

        safeNotify(ctx, formatSavingsSummary(summarizeSavings(points)));
      },
    });
  });
}

function parseSavingsLimit(args: string): number | undefined {
  const trimmed = args.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  const match = trimmed.match(/^(?:--limit\s+|--limit=)?(\d+)$/u);
  if (!match) {
    return undefined;
  }

  const value = Number(match[1]);
  return Number.isInteger(value) && value > 0 ? Math.min(value, 500) : undefined;
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
export * from "./savings.js";
export * from "./structured-test-report.js";

export default minimalOutputExtension;
