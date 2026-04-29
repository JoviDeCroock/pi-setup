import {
  definePiExtension,
  isBashToolResultEvent,
  type PiMessageContent,
  type PiToolResultPatch,
} from "@pi-setup/pi-kit";

import { minimizeBashOutput, type MinimizeBashOutputOptions } from "./minimize.js";

export interface MinimalOutputExtensionOptions extends MinimizeBashOutputOptions {
  enabled?: boolean;
}

export function createMinimalOutputExtension(options: MinimalOutputExtensionOptions = {}) {
  return definePiExtension((pi) => {
    pi.on("tool_result", (event): PiToolResultPatch | undefined => {
      if (options.enabled === false || !isBashToolResultEvent(event)) {
        return undefined;
      }

      const originalText = textFromContent(event.content);
      if (!originalText) {
        return undefined;
      }

      const decision = minimizeBashOutput(event.input.command, originalText, options);
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

const minimalOutputExtension = createMinimalOutputExtension();

export * from "./minimize.js";

export default minimalOutputExtension;
