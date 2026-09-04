import { Type, type TSchema } from "@sinclair/typebox";

export { Type };

export interface PiMessageContent {
  text: string;
  type: "text";
}

export interface PiToolResult {
  content: PiMessageContent[];
  details?: Record<string, unknown>;
}

export interface PiUiContext {
  notify?: (message: string, level?: string) => void;
  setStatus?: (key: string, value: string) => void;
}

export interface PiModelLike {
  api?: string;
  id?: string;
  name?: string;
  provider?: string;
}

export interface PiContextUsage {
  contextWindow: number;
  percent: number | null;
  tokens: number | null;
}

export interface PiSessionEntryLike {
  customType?: string;
  data?: unknown;
  type?: string;
}

export interface PiSessionManagerLike {
  getEntries?: () => PiSessionEntryLike[];
}

export interface PiExtensionContext {
  abort?: () => void;
  cwd: string;
  getContextUsage?: () => PiContextUsage | undefined;
  hasUI: boolean;
  mode?: "json" | "print" | "rpc" | "tui";
  model?: PiModelLike;
  sessionManager?: PiSessionManagerLike;
  signal?: AbortSignal;
  ui?: PiUiContext;
}

export interface PiBashToolCallInput {
  command: string;
  [key: string]: unknown;
}

export interface PiBashToolCallEventLike {
  input: PiBashToolCallInput;
  toolName: "bash";
}

export interface PiToolResultPatch {
  content?: PiMessageContent[];
  details?: unknown;
  isError?: boolean;
}

export interface PiToolResultEventLike {
  content: PiMessageContent[];
  details?: unknown;
  input: Record<string, unknown>;
  isError?: boolean;
  toolName: string;
}

export interface PiBashToolResultEventLike extends PiToolResultEventLike {
  input: PiBashToolCallInput;
  toolName: "bash";
}

export type PiEventHandler = (
  event: unknown,
  ctx: PiExtensionContext,
) => void | PiToolResultPatch | Promise<unknown>;

export interface PiToolDefinition {
  description: string;
  execute: (...args: unknown[]) => PiToolResult | Promise<PiToolResult>;
  label?: string;
  name: string;
  parameters: unknown;
  executionMode?: "parallel" | "sequential";
}

export interface PiCustomMessage {
  content: string;
  customType: string;
  details?: Record<string, unknown>;
  display: boolean;
}

export interface PiSendMessageOptions {
  deliverAs?: "followUp" | "nextTurn" | "steer";
  triggerTurn?: boolean;
}

export interface PiToolInfo {
  description?: string;
  name: string;
  sourceInfo?: Record<string, unknown>;
}

export interface PiCommandDefinition {
  description: string;
  handler?: (args: string, ctx: PiExtensionContext) => void | Promise<void>;
}

export interface PiExtensionApi {
  appendEntry?: (customType: string, data?: unknown) => void;
  getActiveTools?: () => string[];
  getAllTools?: () => PiToolInfo[];
  on: (event: string, handler: PiEventHandler) => void;
  registerCommand?: (name: string, definition: PiCommandDefinition) => void;
  registerTool: (tool: PiToolDefinition) => void;
  sendMessage?: (message: PiCustomMessage, options?: PiSendMessageOptions) => void;
  setActiveTools?: (names: string[]) => void;
}

export interface PiToolExecutionArgs<TParameters> {
  ctx: PiExtensionContext | undefined;
  onUpdate: ((...args: unknown[]) => void) | undefined;
  params: TParameters;
  rawArgs: unknown[];
  signal: AbortSignal | undefined;
  toolCallId: string | undefined;
}

export const DOCUMENTED_PI_SOURCES = {
  extensionSystem: "https://pt-act-pi-mono.mintlify.app/concepts/extensions",
  packageOverview: "https://pt-act-pi-mono.mintlify.app/packages/coding-agent",
} as const;

export function definePiExtension(setup: (pi: PiExtensionApi) => void): (pi: unknown) => void {
  return (pi: unknown) => {
    setup(pi as PiExtensionApi);
  };
}

export function stringEnum(
  values: readonly string[],
  options: Record<string, unknown> = {},
): TSchema {
  return {
    ...options,
    enum: [...values],
    type: "string",
  } as unknown as TSchema;
}

export function textResult(text: string, details?: Record<string, unknown>): PiToolResult {
  if (details) {
    return {
      content: [{ type: "text", text }],
      details,
    };
  }

  return {
    content: [{ type: "text", text }],
  };
}

export function safeNotify(
  ctx: PiExtensionContext | undefined,
  message: string,
  level = "info",
): void {
  if (ctx?.hasUI) {
    ctx.ui?.notify?.(message, level);
  }
}

export function isBashToolCallEvent(event: unknown): event is PiBashToolCallEventLike {
  if (typeof event !== "object" || event === null) {
    return false;
  }

  const candidate = event as { input?: unknown; toolName?: unknown };

  if (candidate.toolName !== "bash") {
    return false;
  }

  return (
    typeof candidate.input === "object" &&
    candidate.input !== null &&
    typeof (candidate.input as { command?: unknown }).command === "string"
  );
}

export function isBashToolResultEvent(event: unknown): event is PiBashToolResultEventLike {
  if (typeof event !== "object" || event === null) {
    return false;
  }

  const candidate = event as { content?: unknown; input?: unknown; toolName?: unknown };

  if (candidate.toolName !== "bash") {
    return false;
  }

  return (
    Array.isArray(candidate.content) &&
    typeof candidate.input === "object" &&
    candidate.input !== null &&
    typeof (candidate.input as { command?: unknown }).command === "string"
  );
}

export function appendSessionEntry(pi: PiExtensionApi, customType: string, data: unknown): void {
  pi.appendEntry?.(customType, data);
}

export function getActiveToolNames(pi: PiExtensionApi): string[] {
  const tools = pi.getActiveTools?.();
  return Array.isArray(tools)
    ? tools.filter((name): name is string => typeof name === "string" && name.length > 0)
    : [];
}

export function getAllToolNames(pi: PiExtensionApi): string[] {
  const tools = pi.getAllTools?.();

  if (!Array.isArray(tools)) {
    return [];
  }

  return tools
    .map((tool) => tool.name)
    .filter((name): name is string => typeof name === "string" && name.length > 0);
}

export function setActivePiTools(pi: PiExtensionApi, names: string[]): boolean {
  if (!pi.setActiveTools) {
    return false;
  }

  pi.setActiveTools(names);
  return true;
}

export function getSessionEntries(ctx: PiExtensionContext | undefined): PiSessionEntryLike[] {
  const entries = ctx?.sessionManager?.getEntries?.();
  return Array.isArray(entries) ? entries : [];
}

export function getModelId(ctx: PiExtensionContext | undefined): string | undefined {
  const model = ctx?.model;

  if (typeof model?.id === "string" && model.id.length > 0) {
    return model.id;
  }

  if (typeof model?.name === "string" && model.name.length > 0) {
    return model.name;
  }

  return undefined;
}
