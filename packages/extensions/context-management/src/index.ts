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
  buildContextWindowReminder,
  normalizeHistoryNote,
  resolveContextManagementEligibility,
  resolveReminderThreshold,
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

interface BeforeAgentStartEventLike {
  systemPrompt?: unknown;
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
    let awaitingFreshUsage = false;
    let hasBoundary = false;

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
          "new_context interception failed. The history note is still saved; retry new_context.",
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
      awaitingFreshUsage = false;
      hasBoundary = getSessionEntries(ctx).some(
        (entry: PiSessionEntryLike) => entry.customType === HISTORY_BOUNDARY_ENTRY_TYPE,
      );
      removeToolsWhenIneligible(ctx);
    });

    pi.on("model_select", async (_event, ctx) => {
      removeToolsWhenIneligible(ctx);
    });

    pi.on("before_agent_start", async (event, ctx) => {
      removeToolsWhenIneligible(ctx);
      if (!capabilityAvailable(ctx)) {
        return;
      }

      const reminder = buildContextWindowReminder(
        ctx.getContextUsage?.(),
        resolveReminderThreshold(env),
      );
      if (!reminder || reminderIssued) {
        return;
      }
      reminderIssued = true;

      const systemPrompt = (event as BeforeAgentStartEventLike).systemPrompt;
      if (typeof systemPrompt === "string") {
        return { systemPrompt: `${systemPrompt}\n\n${reminder}` };
      }
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
      }
      if (reminderIssued) {
        return;
      }
      const reminder = buildContextWindowReminder(
        ctx.getContextUsage?.(),
        resolveReminderThreshold(env),
      );
      if (reminder) {
        pendingReminder = reminder;
        reminderIssued = true;
      }
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

    pi.on("session_before_compact", async () => {
      if (hasBoundary) {
        return { cancel: true };
      }
    });

    pi.on("session_before_tree", async () => {
      if (hasBoundary) {
        return { cancel: true };
      }
    });
  });
}

const contextManagementExtension = createContextManagementExtension();

export * from "./context.js";
export default contextManagementExtension;
