import { basename } from "node:path";

import {
  discoverWorkspacePackages,
  excerptMatchingLines,
  findWorkspaceRoot,
  formatMarkdownList,
  listFiles,
  readUtf8,
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
  packages: Array<{
    description?: string;
    name: string;
    path: string;
  }>;
  query: string;
  rootPath: string;
  selectedFiles: ContextFile[];
}

export interface RepoContextOptions {
  cwd: string;
  maxBytesPerFile: number;
  maxFiles: number;
  query: string;
}

const TEXT_FILE_PATTERN = /\.(c|m)?[jt]sx?$|\.json$|\.md$|\.ya?ml$|\.txt$/i;
const PRIORITY_FILENAMES = new Set([
  "AGENTS.md",
  "README.md",
  "package.json",
  "pnpm-workspace.yaml",
]);

export async function buildRepoContext(options: RepoContextOptions): Promise<RepoContextReport> {
  const rootPath = await findWorkspaceRoot(options.cwd);
  const query = options.query.trim() || "workspace overview";
  const tokens = tokenizeQuery(query);
  const packages = await discoverWorkspacePackages(rootPath);
  const files = await listFiles(rootPath, {
    include: (filePath) => TEXT_FILE_PATTERN.test(filePath),
  });

  const candidates: ContextFile[] = [];

  for (const absolutePath of files) {
    const relativePath = toPortablePath(absolutePath, rootPath);
    const priorityScore = PRIORITY_FILENAMES.has(basename(relativePath)) ? 3 : 0;
    const pathScore = scoreTextAgainstQuery(relativePath, tokens) * 4;

    let contentScore = 0;
    let excerpt = "";

    try {
      const content = truncate(await readUtf8(absolutePath), options.maxBytesPerFile);
      contentScore = scoreTextAgainstQuery(content, tokens);
      excerpt = excerptMatchingLines(content, tokens, 14);
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
    packages,
    query,
    rootPath,
    selectedFiles: candidates.slice(0, Math.max(1, options.maxFiles)),
  };
}

export function formatRepoContext(report: RepoContextReport): string {
  const lines = [
    "# Repo Context",
    "",
    `Workspace root: \`${report.rootPath}\``,
    `Query: ${report.query}`,
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
