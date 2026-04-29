import type { DiagnosticProfile } from "./types.js";

export function classifyDiagnosticCommand(command: string): DiagnosticProfile | undefined {
  const normalized = command
    .replace(/\\\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (isTscCommand(normalized)) {
    return "tsc";
  }

  if (isLintCommand(normalized)) {
    return "lint";
  }

  if (isTestCommand(normalized)) {
    return "test";
  }

  if (isBuildCommand(normalized)) {
    return "build";
  }

  if (isPackageManagerCommand(normalized)) {
    return "package-manager";
  }

  return undefined;
}

function isTscCommand(command: string): boolean {
  return (
    /(?:^|[;&|()\s])(?:(?:pnpm|npm|yarn|bun|npx)\s+(?:(?:run|exec|dlx|x)\s+)?)?(?:vue-)?tsc\b/iu.test(
      command,
    ) ||
    /(?:^|[;&|()\s])(?:pnpm|npm|yarn|bun)\s+(?:run\s+)?(?:type-?check|check-types)(?::[\w-]+)?\b/iu.test(
      command,
    )
  );
}

function isLintCommand(command: string): boolean {
  return (
    /(?:^|[;&|()\s])(?:(?:pnpm|npm|yarn|bun|npx)\s+(?:(?:run|exec|dlx|x)\s+)?)?(?:eslint|oxlint|biome\s+lint)\b/iu.test(
      command,
    ) || /(?:^|[;&|()\s])(?:pnpm|npm|yarn|bun)\s+(?:run\s+)?lint(?::[\w-]+)?\b/iu.test(command)
  );
}

function isTestCommand(command: string): boolean {
  return (
    /(?:^|[;&|()\s])(?:(?:pnpm|npm|yarn|bun|npx)\s+(?:(?:run|exec|dlx|x)\s+)?)?(?:vitest|jest|mocha|uvu|ava|pytest|go\s+test|cargo\s+test|playwright\s+test|cypress\s+run|node\s+--test)\b/iu.test(
      command,
    ) || /(?:^|[;&|()\s])(?:pnpm|npm|yarn|bun)\s+(?:run\s+)?test(?::[\w-]+)?\b/iu.test(command)
  );
}

function isBuildCommand(command: string): boolean {
  return (
    /(?:^|[;&|()\s])(?:(?:pnpm|npm|yarn|bun|npx)\s+(?:(?:run|exec|dlx|x)\s+)?)?(?:vite\s+build|next\s+build|webpack|rollup|tsup|esbuild|turbo\s+run\s+build|nx\s+(?:run\s+[^\s]+:)?build|go\s+build|cargo\s+build)\b/iu.test(
      command,
    ) ||
    /(?:^|[;&|()\s])(?:pnpm|npm|yarn|bun)\s+(?:run\s+)?(?:build|compile|bundle)(?::[\w-]+)?\b/iu.test(
      command,
    )
  );
}

function isPackageManagerCommand(command: string): boolean {
  return /(?:^|[;&|()\s])(?:pnpm|npm|yarn|bun)\s+(?:install|i|add|remove|rm|uninstall|update|up|ci|dedupe|prune|rebuild)\b/iu.test(
    command,
  );
}
