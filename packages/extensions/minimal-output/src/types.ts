export type DiagnosticProfile = "build" | "lint" | "package-manager" | "test" | "tsc";
export type DiagnosticSeverity = "error" | "info" | "warning";

export interface Diagnostic {
  code?: string | undefined;
  column?: number | undefined;
  file?: string | undefined;
  line?: number | undefined;
  message: string;
  severity: DiagnosticSeverity;
}

export interface MinimizeBashOutputOptions {
  isError?: boolean;
  maxDiagnostics?: number;
  maxMessageLength?: number;
}

export interface MinimizedOutput {
  diagnostics: Diagnostic[];
  omittedDiagnostics: number;
  originalLength: number;
  originalLineCount: number;
  profile: DiagnosticProfile;
  text: string;
}

export type MinimizeBashOutputDecision =
  | { reason: string; status: "unchanged" }
  | ({ status: "minimized" } & MinimizedOutput);

export interface DiagnosticSummary {
  errors: number;
  warnings: number;
}

export interface ParsedDiagnostics {
  diagnostics: Diagnostic[];
  summary?: DiagnosticSummary;
}

export interface FormatLimits {
  maxDiagnostics: number;
  maxMessageLength: number;
}

export interface ProfileMinimization {
  diagnostics: Diagnostic[];
  text: string;
}
