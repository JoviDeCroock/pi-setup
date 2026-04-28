import { basename, extname, join } from "node:path";

import {
  discoverWorkspacePackages,
  excerptMatchingLinesWithLineNumbers,
  findWorkspaceRoot,
  formatMarkdownList,
  listFiles,
  readUtf8,
  runCommand,
  scoreTextAgainstQuery,
  toPortablePath,
  tokenizeQuery,
  truncate,
} from "@pi-setup/shared";

export interface ContextFile {
  excerpt: string;
  path: string;
  reason: string;
  score: number;
}

export interface RepoContextReport {
  fileSource: "filesystem" | "git";
  packages: Array<{
    description?: string;
    name: string;
    path: string;
  }>;
  query: string;
  rootPath: string;
  scannedFileCount: number;
  selectedFiles: ContextFile[];
}

export interface RepoContextOptions {
  cwd: string;
  includeExtensions?: string[];
  maxBytesPerFile: number;
  maxFiles: number;
  query: string;
}

const DEFAULT_TEXT_EXTENSIONS = new Set([
  "bash",
  "c",
  "cc",
  "cjs",
  "cpp",
  "cs",
  "css",
  "cts",
  "cxx",
  "fish",
  "go",
  "h",
  "hpp",
  "html",
  "ini",
  "java",
  "js",
  "json",
  "jsx",
  "kt",
  "kts",
  "lua",
  "m",
  "md",
  "mdx",
  "mjs",
  "mts",
  "php",
  "proto",
  "py",
  "rb",
  "rs",
  "scss",
  "sh",
  "sql",
  "swift",
  "toml",
  "ts",
  "tsx",
  "txt",
  "xml",
  "yaml",
  "yml",
  "zsh",
]);
const TEXT_FILENAMES = new Set([
  ".env",
  ".gitignore",
  ".npmrc",
  "Dockerfile",
  "Makefile",
  "Procfile",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
]);
const PRIORITY_FILENAMES = new Set(["README.md", "package.json", "pnpm-workspace.yaml"]);
const MAX_CANDIDATE_FILES = 5_000;

export async function buildRepoContext(options: RepoContextOptions): Promise<RepoContextReport> {
  const rootPath = await findWorkspaceRoot(options.cwd);
  const query = options.query.trim() || "workspace overview";
  const tokens = tokenizeQuery(query);
  const packages = await discoverWorkspacePackages(rootPath);
  const isTextFile = createTextFileMatcher(options.includeExtensions ?? []);
  const listing = await listRepoFiles(rootPath, isTextFile);
  const files = listing.files.slice(0, MAX_CANDIDATE_FILES);

  const candidates: ContextFile[] = [];

  for (const absolutePath of files) {
    const relativePath = toPortablePath(absolutePath, rootPath);
    const priorityScore = PRIORITY_FILENAMES.has(basename(relativePath)) ? 3 : 0;
    const pathScore = scoreTextAgainstQuery(relativePath, tokens) * 6;

    let contentScore = 0;
    let excerpt = "";

    try {
      const content = truncate(await readUtf8(absolutePath), options.maxBytesPerFile);
      contentScore = Math.min(scoreTextAgainstQuery(content, tokens), 40);
      excerpt = excerptMatchingLinesWithLineNumbers(content, tokens, 14);
    } catch {
      continue;
    }

    const score = priorityScore + pathScore + contentScore;
    if (score === 0 && tokens.length > 0) {
      continue;
    }

    candidates.push({
      excerpt,
      path: relativePath,
      reason: describeReason({ contentScore, pathScore, priorityScore }),
      score,
    });
  }

  if (tokens.length === 0 && candidates.length === 0) {
    candidates.push({
      excerpt: "",
      path: "README.md",
      reason: "default workspace anchor",
      score: 1,
    });
  }

  candidates.sort((left, right) => right.score - left.score || left.path.localeCompare(right.path));

  return {
    fileSource: listing.source,
    packages,
    query,
    rootPath,
    scannedFileCount: files.length,
    selectedFiles: candidates.slice(0, Math.max(1, options.maxFiles)),
  };
}

export function formatRepoContext(report: RepoContextReport): string {
  const lines = [
    "# Repo Context",
    "",
    `Workspace root: \`${report.rootPath}\``,
    `Query: ${report.query}`,
    `Files considered: ${report.scannedFileCount} (${describeFileSource(report.fileSource)})`,
    "",
  ];

  if (report.packages.length > 0) {
    lines.push("## Packages", "");
    lines.push(
      formatMarkdownList(
        report.packages.map(
          (pkg) =>
            `\`${pkg.name}\` in \`${pkg.path}\`${pkg.description ? ` - ${pkg.description}` : ""}`,
        ),
      ),
    );
    lines.push("");
  }

  if (report.selectedFiles.length === 0) {
    lines.push("No matching files were found for the requested query.");
    return lines.join("\n");
  }

  lines.push("## Relevant files", "");

  for (const file of report.selectedFiles) {
    lines.push(`### \`${file.path}\``);
    lines.push(`Reason: ${file.reason}`);
    if (file.excerpt) {
      lines.push("", "```text", file.excerpt, "```");
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

function createTextFileMatcher(extraExtensions: string[]): (filePath: string) => boolean {
  const extensions = new Set(DEFAULT_TEXT_EXTENSIONS);
  for (const extension of extraExtensions) {
    const normalized = normalizeExtension(extension);
    if (normalized) {
      extensions.add(normalized);
    }
  }

  return (filePath: string) => {
    const fileName = basename(filePath);
    if (TEXT_FILENAMES.has(fileName) || fileName.startsWith(".env.")) {
      return true;
    }

    const extension = normalizeExtension(extname(fileName));
    return extension.length > 0 && extensions.has(extension);
  };
}

async function listRepoFiles(
  rootPath: string,
  include: (filePath: string) => boolean,
): Promise<{ files: string[]; source: "filesystem" | "git" }> {
  const gitListing = await runCommand(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard"],
    {
      allowFailure: true,
      cwd: rootPath,
      timeoutMs: 3_000,
    },
  );

  if (gitListing.exitCode === 0) {
    return {
      files: uniqueSorted(
        gitListing.stdout
          .split(/\r?\n/)
          .filter((relativePath) => relativePath.length > 0)
          .map((relativePath) => join(rootPath, relativePath))
          .filter(include),
      ),
      source: "git",
    };
  }

  return {
    files: await listFiles(rootPath, { include }),
    source: "filesystem",
  };
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

function normalizeExtension(extension: string): string {
  return extension.trim().toLowerCase().replace(/^\./, "");
}

function describeFileSource(source: "filesystem" | "git"): string {
  return source === "git" ? "git ls-files, respecting .gitignore" : "filesystem walk fallback";
}

function describeReason(scores: {
  contentScore: number;
  pathScore: number;
  priorityScore: number;
}): string {
  const parts: string[] = [];

  if (scores.priorityScore > 0) {
    parts.push("workspace anchor");
  }
  if (scores.pathScore > 0) {
    parts.push("path matched query");
  }
  if (scores.contentScore > 0) {
    parts.push("content matched query");
  }

  return parts.join(", ") || "fallback match";
}
