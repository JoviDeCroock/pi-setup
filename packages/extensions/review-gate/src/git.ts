import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import { findWorkspaceRoot, runCommand } from "@pi-setup/shared";

import type { ChangedFile } from "./gate.js";

export type GitDiffScope = "all" | "last-commit" | "staged" | "working-tree";

export interface GitChangeSet {
  changes: ChangedFile[];
  rootPath: string;
  scope: GitDiffScope;
}

const MAX_UNTRACKED_FILE_BYTES = 256 * 1024;
const MAX_UNTRACKED_FILES = 200;

export async function collectGitChanges(options: {
  cwd: string;
  maxFiles: number;
  scope: GitDiffScope;
  signal?: AbortSignal;
}): Promise<GitChangeSet> {
  const rootPath = await findWorkspaceRoot(options.cwd);
  const numstatArgs = buildGitDiffArgs(options.scope, "numstat");
  const patchArgs = buildGitDiffArgs(options.scope, "patch");

  const [numstatResult, patchResult] = await Promise.all([
    runCommand("git", numstatArgs, {
      allowFailure: true,
      cwd: rootPath,
      ...(options.signal ? { signal: options.signal } : {}),
      timeoutMs: 10_000,
    }),
    runCommand("git", patchArgs, {
      allowFailure: true,
      cwd: rootPath,
      ...(options.signal ? { signal: options.signal } : {}),
      timeoutMs: 10_000,
    }),
  ]);

  if (numstatResult.exitCode !== 0) {
    throw new Error(numstatResult.stderr || "Unable to inspect git diff output.");
  }

  if (patchResult.exitCode !== 0) {
    throw new Error(patchResult.stderr || "Unable to inspect git patch output.");
  }

  const changeMap = parseNumstat(numstatResult.stdout);
  mergePatchLines(changeMap, patchResult.stdout);

  if (options.scope === "all" || options.scope === "working-tree") {
    await mergeUntrackedFiles(changeMap, rootPath, options.signal);
  }

  const changes = Array.from(changeMap.values())
    .sort(
      (left, right) =>
        right.additions + right.deletions - (left.additions + left.deletions) ||
        left.path.localeCompare(right.path),
    )
    .slice(0, Math.max(1, options.maxFiles));

  return {
    changes,
    rootPath,
    scope: options.scope,
  };
}

function buildGitDiffArgs(scope: GitDiffScope, output: "numstat" | "patch"): string[] {
  const formatArg = output === "numstat" ? "--numstat" : "--unified=0";

  switch (scope) {
    case "all":
      return ["diff", "HEAD", formatArg, "--relative"];
    case "staged":
      return ["diff", "--cached", formatArg, "--relative"];
    case "last-commit":
      return ["diff", "HEAD~1", "HEAD", formatArg, "--relative"];
    case "working-tree":
    default:
      return ["diff", formatArg, "--relative"];
  }
}

function parseNumstat(stdout: string): Map<string, ChangedFile> {
  const changeMap = new Map<string, ChangedFile>();

  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const [additionsRaw, deletionsRaw, ...pathParts] = trimmed.split("\t");
    const path = pathParts.join("\t");
    if (!path) {
      continue;
    }

    changeMap.set(path, {
      additions: additionsRaw === "-" ? 0 : Number.parseInt(additionsRaw ?? "0", 10) || 0,
      addedLines: [],
      deletions: deletionsRaw === "-" ? 0 : Number.parseInt(deletionsRaw ?? "0", 10) || 0,
      path,
    });
  }

  return changeMap;
}

function mergePatchLines(changeMap: Map<string, ChangedFile>, patch: string): void {
  let currentPath: string | undefined;

  for (const line of patch.split(/\r?\n/)) {
    if (line.startsWith("+++ ")) {
      const candidate = line.slice(4).trim();
      currentPath =
        candidate === "/dev/null"
          ? undefined
          : candidate.startsWith("b/")
            ? candidate.slice(2)
            : candidate;

      if (currentPath && !changeMap.has(currentPath)) {
        changeMap.set(currentPath, {
          additions: 0,
          addedLines: [],
          deletions: 0,
          path: currentPath,
        });
      }

      continue;
    }

    if (!currentPath) {
      continue;
    }

    if (line.startsWith("+") && !line.startsWith("+++")) {
      changeMap.get(currentPath)?.addedLines.push(line.slice(1));
    }
  }
}

async function mergeUntrackedFiles(
  changeMap: Map<string, ChangedFile>,
  rootPath: string,
  signal: AbortSignal | undefined,
): Promise<void> {
  const result = await runCommand("git", ["ls-files", "--others", "--exclude-standard", "-z"], {
    allowFailure: true,
    cwd: rootPath,
    ...(signal ? { signal } : {}),
    timeoutMs: 10_000,
  });

  if (result.exitCode !== 0) {
    return;
  }

  const untrackedPaths = result.stdout.split("\0").filter(Boolean).slice(0, MAX_UNTRACKED_FILES);

  for (const relativePath of untrackedPaths) {
    if (signal?.aborted) {
      throw new Error("Review gate cancelled while reading untracked files.");
    }

    if (changeMap.has(relativePath)) {
      continue;
    }

    const absolutePath = join(rootPath, relativePath);
    const fileStat = await stat(absolutePath).catch(() => undefined);
    if (!fileStat?.isFile()) {
      continue;
    }

    if (fileStat.size > MAX_UNTRACKED_FILE_BYTES) {
      changeMap.set(relativePath, {
        additions: 0,
        addedLines: [],
        deletions: 0,
        path: relativePath,
      });
      continue;
    }

    const content = await readFile(absolutePath, "utf8").catch(() => "");
    const addedLines = content.split(/\r?\n/);

    changeMap.set(relativePath, {
      additions: content.length === 0 ? 0 : addedLines.length,
      addedLines,
      deletions: 0,
      path: relativePath,
    });
  }
}
