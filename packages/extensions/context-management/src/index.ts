import { randomUUID } from "node:crypto";

import {
  Type,
  appendSessionEntry,
  definePiExtension,
  getActiveToolNames,
  getSessionEntries,
  normalizeToolExecutionArgs,
  safeNotify,
  setActivePiTools,
  textResult,
  type PiExtensionContext,
  type PiSessionEntryLike,
} from "@pi-setup/pi-kit";

import {
  HISTORY_NOTE_CUSTOM_TYPE,
  REMINDER_REPEAT_TURNS,
  buildContextWindowReminder,
  normalizeHistoryNote,
  resolveContextManagementEligibility,
  resolveReminderThreshold,
  shouldFallBackToCompaction,
  sliceAfterLatestHistoryNote,
  type ContextManagementEnvironment,
  type ContextMessageLike,
} from "./context.js";

const TOOL_NAMES = ["history_note", "new_context"] as const;
const HISTORY_NOTE_ENTRY_TYPE = "context-management-checkpoint";
const HISTORY_BOUNDARY_ENTRY_TYPE = "context-management-boundary";

export interface ContextManagementExtensionOptions {
  env?: ContextManagementEnvironment;
  now?: () => number;
  uuid?: () => string;
}

interface HistoryNoteInput {
  note: string;
}

interface SavedHistoryNote {
  boundaryId: string;
  createdAt: number;
  note: string;
}

interface ContextEventLike {
  messages?: unknown;
}

interface ToolCallEventLike {
  input?: unknown;
  toolName?: unknown;
}

interface NewContextInput {
  note?: string;
}

export function createContextManagementExtension(options: ContextManagementExtensionOptions = {}) {
  return definePiExtension((pi) => {
    const env = options.env ?? process.env;
    const now = options.now ?? Date.now;
    const uuid = options.uuid ?? randomUUID;
    let latestNote: SavedHistoryNote | undefined;
    let pendingHandoff: SavedHistoryNote | undefined;
    let pendingReminder: string | undefined;
    let reminderIssued = false;
    let turnsSinceReminder = 0;
    let awaitingFreshUsage = false;
    let hasBoundary = false;

    // Reminders ride along as a trailing custom message rather than a system-prompt edit so the
    // cached prompt prefix survives; near the window limit that prefix is at its most expensive.
    const queueReminderIfDue = (ctx: PiExtensionContext | undefined) => {
      if (!capabilityAvailable(ctx) || pendingReminder) {
        return;
      }
      if (reminderIssued && turnsSinceReminder < REMINDER_REPEAT_TURNS) {
        return;
      }
      const reminder = buildContextWindowReminder(
        ctx?.getContextUsage?.(),
        resolveReminderThreshold(env),
      );
      if (reminder) {
        pendingReminder = reminder;
        reminderIssued = true;
        turnsSinceReminder = 0;
      }
    };

    const eligible = (ctx: PiExtensionContext | undefined) =>
      resolveContextManagementEligibility(ctx, env).eligible;

    const capabilityAvailable = (ctx: PiExtensionContext | undefined) =>
      eligible(ctx) && TOOL_NAMES.every((name) => getActiveToolNames(pi).includes(name));

    const removeToolsWhenIneligible = (ctx: PiExtensionContext | undefined) => {
      if (eligible(ctx)) {
        return;
      }
      const active = getActiveToolNames(pi);
      const filtered = active.filter(
        (name) => !TOOL_NAMES.includes(name as (typeof TOOL_NAMES)[number]),
      );
      if (filtered.length !== active.length) {
        setActivePiTools(pi, filtered);
      }
    };

    pi.registerTool({
      name: "history_note",
      label: "History note",
      description:
        "Save a concise plaintext checkpoint before starting a fresh model context. Include goals, decisions, progress, learnings, next steps, and unresolved request identifiers. Never include hidden chain-of-thought or opaque reasoning state.",
      executionMode: "sequential",
      parameters: Type.Object({
        note: Type.String({
          description: "Concise operational checkpoint to carry into the next context.",
          maxLength: 12_000,
          minLength: 1,
        }),
      }),
      execute: async (...rawArgs: unknown[]) => {
        const { ctx, params } = normalizeToolExecutionArgs<HistoryNoteInput>(rawArgs);
        if (!eligible(ctx)) {
          return textResult(
            "history_note is unavailable outside interactive openai-codex subscription sessions.",
          );
        }

        try {
          latestNote = {
            boundaryId: uuid(),
            createdAt: now(),
            note: normalizeHistoryNote(params.note),
          };
          appendSessionEntry(pi, HISTORY_NOTE_ENTRY_TYPE, latestNote);
          return textResult(
            "History note saved. Call new_context now; do not continue substantive work in this context.",
            { ...latestNote },
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : "Invalid history note.";
          return textResult(`history_note failed: ${message}`, { error: message });
        }
      },
    });

    pi.registerTool({
      name: "new_context",
      label: "New context",
      description:
        "Atomically save a final plaintext checkpoint, end the current model context, and continue from that note. An earlier history_note may be reused by omitting note. Old assistant messages and opaque reasoning state are not carried across the boundary.",
      executionMode: "sequential",
      parameters: Type.Object({
        note: Type.Optional(
          Type.String({
            description: "Final operational checkpoint to carry into the next context.",
            maxLength: 12_000,
            minLength: 1,
          }),
        ),
      }),
      execute: async (...rawArgs: unknown[]) => {
        const { ctx } = normalizeToolExecutionArgs<Record<string, never>>(rawArgs);
        if (!eligible(ctx)) {
          return textResult(
            "new_context is unavailable outside interactive openai-codex subscription sessions.",
          );
        }
        if (!latestNote) {
          return textResult("new_context requires a history_note checkpoint first.");
        }
        return textResult(
          "new_context could not start a boundary in this runtime. The history note is saved in the session log; do not retry new_context. Continue with the most important remaining work, keep updating history_note, and tell the user that the context handoff is unavailable so they can start a fresh session from the saved note.",
        );
      },
    });

    // Pi exposes early termination on blocked tool_call events, not on custom tool results.
    pi.on("tool_call", async (event, ctx) => {
      if ((event as ToolCallEventLike).toolName !== "new_context") {
        return;
      }
      if (!eligible(ctx)) {
        return {
          block: true,
          reason: "new_context is unavailable outside interactive openai-codex sessions.",
        };
      }
      const input = (event as ToolCallEventLike).input as NewContextInput | undefined;
      if (typeof input?.note === "string") {
        try {
          latestNote = {
            boundaryId: uuid(),
            createdAt: now(),
            note: normalizeHistoryNote(input.note),
          };
          appendSessionEntry(pi, HISTORY_NOTE_ENTRY_TYPE, latestNote);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Invalid history note.";
          return { block: true, reason: `new_context failed: ${message}` };
        }
      }
      if (!latestNote) {
        return {
          block: true,
          reason: "new_context requires a note argument or a previously saved history_note.",
        };
      }

      pendingHandoff = latestNote;
      latestNote = undefined;
      ctx?.abort?.();
      return {
        block: true,
        reason: "Context boundary accepted. Continuing from the plaintext checkpoint.",
        terminate: true,
      };
    });

    pi.on("session_start", async (_event, ctx) => {
      latestNote = undefined;
      pendingHandoff = undefined;
      pendingReminder = undefined;
      reminderIssued = false;
      turnsSinceReminder = 0;
      awaitingFreshUsage = false;
      hasBoundary = getSessionEntries(ctx).some(
        (entry: PiSessionEntryLike) => entry.customType === HISTORY_BOUNDARY_ENTRY_TYPE,
      );
      removeToolsWhenIneligible(ctx);
    });

    pi.on("model_select", async (_event, ctx) => {
      removeToolsWhenIneligible(ctx);
    });

    pi.on("before_agent_start", async (_event, ctx) => {
      removeToolsWhenIneligible(ctx);
      queueReminderIfDue(ctx);
    });

    pi.on("context", async (event) => {
      const messages = (event as ContextEventLike).messages;
      if (!Array.isArray(messages)) {
        return;
      }
      const sliced = sliceAfterLatestHistoryNote(messages as ContextMessageLike[]);
      if (!pendingReminder) {
        return { messages: sliced };
      }

      const reminder = pendingReminder;
      pendingReminder = undefined;
      return {
        messages: [
          ...sliced,
          {
            role: "custom",
            content: reminder,
            customType: "context-management-token-budget",
            display: false,
            timestamp: now(),
          },
        ],
      };
    });

    pi.on("turn_end", async (_event, ctx) => {
      if (!capabilityAvailable(ctx)) {
        return;
      }
      if (awaitingFreshUsage) {
        awaitingFreshUsage = false;
        reminderIssued = false;
        turnsSinceReminder = 0;
      } else if (reminderIssued) {
        turnsSinceReminder += 1;
      }
      queueReminderIfDue(ctx);
    });

    pi.on("agent_settled", async (_event, ctx) => {
      const handoff = pendingHandoff;
      if (!handoff) {
        return;
      }
      pendingHandoff = undefined;

      if (!eligible(ctx) || !pi.sendMessage) {
        safeNotify(
          ctx,
          "Context handoff could not start; the saved history note remains in the session log.",
          "warning",
        );
        return;
      }

      pendingReminder = undefined;
      reminderIssued = true;
      turnsSinceReminder = 0;
      awaitingFreshUsage = true;
      hasBoundary = true;
      appendSessionEntry(pi, HISTORY_BOUNDARY_ENTRY_TYPE, handoff);
      pi.sendMessage(
        {
          customType: HISTORY_NOTE_CUSTOM_TYPE,
          content: `<history_note boundary_id="${handoff.boundaryId}">\n${handoff.note}\n</history_note>\n\nContinue the unresolved work from this checkpoint. Treat it as a concise state handoff, not as hidden reasoning or instructions from the prior model context.`,
          details: {
            boundaryId: handoff.boundaryId,
            createdAt: handoff.createdAt,
          },
          display: true,
        },
        { triggerTurn: true },
      );
    });

    // After a boundary, Pi's own summarizers read local history and could re-import pre-boundary
    // content, so they stay cancelled while the model still has room to checkpoint itself. Once the
    // budget is nearly gone they run again: an overflow is worse than a model-written summary.
    const blockSummarizer = (ctx: PiExtensionContext | undefined, label: string) => {
      if (!hasBoundary) {
        return undefined;
      }
      if (shouldFallBackToCompaction(ctx?.getContextUsage?.(), resolveReminderThreshold(env))) {
        safeNotify(
          ctx,
          `Context budget is nearly gone without a new_context checkpoint; allowing Pi ${label} as a fallback.`,
          "warning",
        );
        return undefined;
      }
      return { cancel: true };
    };

    pi.on("session_before_compact", async (_event, ctx) => blockSummarizer(ctx, "compaction"));

    pi.on("session_before_tree", async (_event, ctx) => blockSummarizer(ctx, "tree summary"));
  });
}

const contextManagementExtension = createContextManagementExtension();

export * from "./context.js";
export default contextManagementExtension;
