import {
  definePiExtension,
  getActiveToolNames,
  safeNotify,
  setActivePiTools,
  type PiExtensionApi,
  type PiExtensionContext,
} from "@pi-setup/pi-kit";

import {
  isToolPrunerDisabled,
  pruneToolNames,
  resolveAllowedToolNames,
  type ToolPrunerEnvironment,
} from "./prune.js";

export interface ToolPrunerExtensionOptions {
  env?: ToolPrunerEnvironment;
  notify?: boolean;
}

export interface ApplyToolPrunerResult {
  disabledNames: string[];
  keptNames: string[];
  reason?: "disabled" | "no-tool-api" | "no-tools" | "no-matches";
}

export function applyToolPruner(
  pi: PiExtensionApi,
  options: ToolPrunerExtensionOptions = {},
): ApplyToolPrunerResult {
  const env = options.env ?? process.env;

  if (isToolPrunerDisabled(env)) {
    return { disabledNames: [], keptNames: [], reason: "disabled" };
  }

  const availableNames = getActiveToolNames(pi);
  if (availableNames.length === 0) {
    return { disabledNames: [], keptNames: [], reason: "no-tools" };
  }

  const allowedNames = resolveAllowedToolNames({ env });
  const result = pruneToolNames({ allowedNames, availableNames });

  if (result.keptNames.length === 0) {
    return { ...result, reason: "no-matches" };
  }

  if (!setActivePiTools(pi, result.keptNames)) {
    return { ...result, reason: "no-tool-api" };
  }

  return result;
}

export function createToolPrunerExtension(options: ToolPrunerExtensionOptions = {}) {
  return definePiExtension((pi) => {
    let lastKept = "";

    const apply = (ctx?: PiExtensionContext) => {
      const result = applyToolPruner(pi, options);
      const keptKey = result.keptNames.join("\0");

      if (options.notify && !result.reason && keptKey !== lastKept) {
        safeNotify(
          ctx,
          `Tool pruner kept ${result.keptNames.length} tools and disabled ${result.disabledNames.length}.`,
        );
      }

      lastKept = keptKey;
    };

    pi.on("session_start", async (_event, ctx) => {
      apply(ctx);
    });

    pi.on("before_agent_start", async (_event, ctx) => {
      apply(ctx);
    });
  });
}

const toolPrunerExtension = createToolPrunerExtension();

export * from "./prune.js";

export default toolPrunerExtension;
