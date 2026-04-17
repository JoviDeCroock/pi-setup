import { Type } from "@sinclair/typebox";

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
  id?: string;
  name?: string;
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
  cwd: string;
  getContextUsage?: () => Record<string, unknown> | undefined;
  hasUI: boolean;
  model?: PiModelLike;
  sessionManager?: PiSessionManagerLike;
  ui?: PiUiContext;
}

export type PiEventHandler = (event: unknown, ctx: PiExtensionContext) => void | Promise<unknown>;

export interface PiToolDefinition {
  description: string;
  execute: (...args: unknown[]) => PiToolResult | Promise<PiToolResult>;
  label?: string;
  name: string;
  parameters: unknown;
}

export interface PiCommandDefinition {
  description: string;
  handler?: (args: string, ctx: PiExtensionContext) => void | Promise<void>;
}

export interface PiExtensionApi {
  appendEntry?: (customType: string, data?: unknown) => void;
  on: (event: string, handler: PiEventHandler) => void;
  registerCommand?: (name: string, definition: PiCommandDefinition) => void;
  registerTool: (tool: PiToolDefinition) => void;
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

export function appendSessionEntry(pi: PiExtensionApi, customType: string, data: unknown): void {
  pi.appendEntry?.(customType, data);
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
