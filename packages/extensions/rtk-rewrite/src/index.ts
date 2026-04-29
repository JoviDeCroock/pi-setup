import { definePiExtension, isBashToolCallEvent, safeNotify } from "@pi-setup/pi-kit";

import {
  rewriteCommandWithRtk,
  shouldDeferToMinimalOutput,
  type RtkCommandRunner,
  type RtkRewriteOptions,
} from "./rewrite.js";

export interface RtkRewriteExtensionOptions {
  notifyUnavailable?: boolean;
  runner?: RtkCommandRunner;
  timeoutMs?: number;
}

export function createRtkRewriteExtension(options: RtkRewriteExtensionOptions = {}) {
  return definePiExtension((pi) => {
    let rtkUnavailable = false;

    pi.on("tool_call", async (event, ctx) => {
      if (rtkUnavailable || !isBashToolCallEvent(event)) {
        return;
      }

      if (shouldDeferToMinimalOutput(event.input.command, { cwd: ctx.cwd })) {
        return;
      }

      const rewriteOptions: RtkRewriteOptions = {
        cwd: ctx.cwd,
      };

      if (options.runner) {
        rewriteOptions.runner = options.runner;
      }

      if (ctx.signal) {
        rewriteOptions.signal = ctx.signal;
      }

      if (options.timeoutMs !== undefined) {
        rewriteOptions.timeoutMs = options.timeoutMs;
      }

      const decision = await rewriteCommandWithRtk(event.input.command, rewriteOptions);

      if (decision.status === "rewritten") {
        event.input.command = decision.command;
        return;
      }

      if (decision.status === "unavailable") {
        rtkUnavailable = true;
        if (options.notifyUnavailable) {
          safeNotify(ctx, "RTK is not on PATH; Bash command rewrites are disabled.", "warning");
        }
      }
    });
  });
}

const rtkRewriteExtension = createRtkRewriteExtension();

export * from "./rewrite.js";

export default rtkRewriteExtension;
