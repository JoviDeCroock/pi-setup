#!/usr/bin/env node

import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";

const defaultSessionDir = join(homedir(), ".pi", "agent", "sessions");

const usage = `Usage:
  session-lessons.mjs list [--cwd <path>] [--all] [--limit <n>] [--session-dir <dir>]
  session-lessons.mjs extract <session.jsonl> [--max-entries <n>] [--max-entry-chars <n>]

Examples:
  node scripts/session-lessons.mjs list --cwd "$PWD" --limit 10
  node scripts/session-lessons.mjs list --all --limit 20
  node scripts/session-lessons.mjs extract ~/.pi/agent/sessions/.../session.jsonl
`;

async function main() {
  const { command, options, positional } = parseArgs(process.argv.slice(2));

  if (!command || command === "help" || command === "--help" || command === "-h" || options.help) {
    console.log(usage.trim());
    return;
  }

  if (command === "list") {
    await listSessions(options);
    return;
  }

  if (command === "extract") {
    const [sessionFile] = positional;
    if (!sessionFile) {
      throw new Error("Expected a session JSONL path for `extract`.");
    }

    await extractSession(resolvePath(sessionFile), options);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

function parseArgs(args) {
  const [command, ...rest] = args;
  const options = {
    all: false,
    cwd: process.cwd(),
    help: false,
    limit: 10,
    maxEntries: 200,
    maxEntryChars: 1_200,
    sessionDir: defaultSessionDir,
  };
  const positional = [];

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];

    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }

    if (token === "--all") {
      options.all = true;
      continue;
    }

    if (token === "--cwd") {
      options.cwd = readValue(rest, index, token);
      index += 1;
      continue;
    }

    if (token === "--limit") {
      options.limit = readPositiveInteger(readValue(rest, index, token), token);
      index += 1;
      continue;
    }

    if (token === "--max-entries") {
      options.maxEntries = readNonNegativeInteger(readValue(rest, index, token), token);
      index += 1;
      continue;
    }

    if (token === "--max-entry-chars") {
      options.maxEntryChars = readPositiveInteger(readValue(rest, index, token), token);
      index += 1;
      continue;
    }

    if (token === "--session-dir") {
      options.sessionDir = readValue(rest, index, token);
      index += 1;
      continue;
    }

    positional.push(token);
  }

  return { command, options, positional };
}

function readValue(args, index, flag) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Expected a value after ${flag}.`);
  }
  return value;
}

function readPositiveInteger(value, flag) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer.`);
  }
  return parsed;
}

function readNonNegativeInteger(value, flag) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${flag} must be a non-negative integer.`);
  }
  return parsed;
}

function resolvePath(path) {
  if (path === "~") {
    return homedir();
  }

  if (path.startsWith("~/")) {
    return join(homedir(), path.slice(2));
  }

  return resolve(path);
}

async function listSessions(options) {
  const sessionDir = resolvePath(options.sessionDir);
  const targetCwd = resolvePath(options.cwd);
  const files = await findJsonlFiles(sessionDir);
  const sortedFiles = files.sort((left, right) => right.modifiedAt - left.modifiedAt);
  const summaries = [];

  for (const file of sortedFiles) {
    const summary = await summarizeSession(file.path, file);
    if (!summary) {
      continue;
    }

    if (!options.all && summary.cwd !== targetCwd) {
      continue;
    }

    summaries.push(summary);
    if (summaries.length >= options.limit) {
      break;
    }
  }

  if (summaries.length === 0) {
    const scope = options.all ? sessionDir : `${targetCwd} in ${sessionDir}`;
    console.log(`No Pi sessions found for ${scope}.`);
    return;
  }

  printSessionTable(summaries);
}

async function findJsonlFiles(root) {
  const files = [];

  async function walk(directory) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error && error.code === "ENOENT") {
        return;
      }
      throw error;
    }

    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
        continue;
      }

      if (!entry.isFile() || !entry.name.endsWith(".jsonl")) {
        continue;
      }

      const fileStat = await stat(path);
      files.push({ modifiedAt: fileStat.mtimeMs, path, size: fileStat.size });
    }
  }

  await walk(root);
  return files;
}

async function summarizeSession(sessionFile, file) {
  let header;
  let firstTimestamp;
  let lastTimestamp;
  let name = "";
  const counts = {
    assistant: 0,
    bash: 0,
    compactions: 0,
    errors: 0,
    messages: 0,
    tool: 0,
    user: 0,
  };

  for await (const entry of readJsonl(sessionFile)) {
    if (entry.type === "session") {
      header = entry;
      firstTimestamp = entry.timestamp ?? firstTimestamp;
      lastTimestamp = entry.timestamp ?? lastTimestamp;
      continue;
    }

    firstTimestamp = firstTimestamp ?? entry.timestamp;
    lastTimestamp = entry.timestamp ?? lastTimestamp;

    if (entry.type === "session_info" && typeof entry.name === "string") {
      name = entry.name;
      continue;
    }

    if (entry.type === "compaction") {
      counts.compactions += 1;
      continue;
    }

    if (entry.type !== "message" || !entry.message) {
      continue;
    }

    counts.messages += 1;
    const role = entry.message.role;

    if (role === "user") {
      counts.user += 1;
    } else if (role === "assistant") {
      counts.assistant += 1;
    } else if (role === "toolResult") {
      counts.tool += 1;
      if (entry.message.isError) {
        counts.errors += 1;
      }
    } else if (role === "bashExecution") {
      counts.bash += 1;
      if (entry.message.exitCode && entry.message.exitCode !== 0) {
        counts.errors += 1;
      }
    }
  }

  if (!header) {
    return undefined;
  }

  return {
    counts,
    cwd: header.cwd ? resolvePath(String(header.cwd)) : "",
    firstTimestamp,
    id: String(header.id ?? ""),
    lastTimestamp,
    modifiedAt: file.modifiedAt,
    name,
    path: sessionFile,
    size: file.size,
  };
}

async function extractSession(sessionFile, options) {
  const entries = [];
  let header;
  let emittedEntries = 0;
  let totalEntries = 0;

  for await (const entry of readJsonl(sessionFile)) {
    if (entry.type === "session") {
      header = entry;
      continue;
    }

    totalEntries += 1;
    if (options.maxEntries > 0 && emittedEntries >= options.maxEntries) {
      continue;
    }

    const rendered = renderEntry(entry, options.maxEntryChars);
    if (rendered) {
      entries.push(rendered);
      emittedEntries += 1;
    }
  }

  console.log(`# Pi Session Extract`);
  console.log("");
  console.log(`- File: \`${sessionFile}\``);
  if (header) {
    console.log(`- ID: \`${header.id ?? "unknown"}\``);
    console.log(`- CWD: \`${header.cwd ?? "unknown"}\``);
    console.log(`- Started: ${header.timestamp ?? "unknown"}`);
    if (header.parentSession) {
      console.log(`- Parent: \`${header.parentSession}\``);
    }
  }
  console.log(
    `- Entries shown: ${entries.length}${options.maxEntries > 0 ? ` of ${totalEntries}` : ""}`,
  );
  console.log(
    "- Note: common secret patterns are redacted; assistant thinking blocks are omitted.",
  );
  console.log("");

  for (const entry of entries) {
    console.log(entry);
    console.log("");
  }

  if (options.maxEntries > 0 && totalEntries > emittedEntries) {
    console.log(
      `_Omitted ${totalEntries - emittedEntries} entries. Re-run with --max-entries 0 to include all._`,
    );
  }
}

async function* readJsonl(file) {
  const stream = createReadStream(file, { encoding: "utf8" });
  const lines = createInterface({ crlfDelay: Infinity, input: stream });

  for await (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    try {
      yield JSON.parse(trimmed);
    } catch (error) {
      yield {
        error: error instanceof Error ? error.message : "Invalid JSON",
        raw: trimmed,
        type: "parse_error",
      };
    }
  }
}

function printSessionTable(summaries) {
  console.log("| # | Updated | ID | Name | Counts | CWD | Path |");
  console.log("|---:|---|---|---|---|---|---|");

  summaries.forEach((summary, index) => {
    const counts = [
      `${summary.counts.user} user`,
      `${summary.counts.assistant} assistant`,
      `${summary.counts.tool} tool`,
      `${summary.counts.bash} bash`,
      `${summary.counts.errors} errors`,
    ].join(", ");
    console.log(
      `| ${index + 1} | ${formatDate(summary.lastTimestamp ?? summary.modifiedAt)} | ${escapeCell(summary.id)} | ${escapeCell(summary.name || "-")} | ${escapeCell(counts)} | \`${escapeCell(summary.cwd)}\` | \`${escapeCell(summary.path)}\` |`,
    );
  });
}

function renderEntry(entry, maxEntryChars) {
  const timestamp = entry.timestamp ?? "unknown time";

  if (entry.type === "parse_error") {
    return `## ${timestamp} parse_error\n\n${truncate(redact(entry.raw), maxEntryChars)}\n\n_Error: ${entry.error}_`;
  }

  if (entry.type === "message" && entry.message) {
    return renderMessage(timestamp, entry.message, maxEntryChars);
  }

  if (entry.type === "compaction") {
    return `## ${timestamp} compaction\n\n${truncate(redact(String(entry.summary ?? "")), maxEntryChars)}`;
  }

  if (entry.type === "branch_summary") {
    return `## ${timestamp} branch_summary\n\n${truncate(redact(String(entry.summary ?? "")), maxEntryChars)}`;
  }

  if (entry.type === "custom_message") {
    const content = contentToText(entry.content, maxEntryChars);
    return `## ${timestamp} custom_message:${entry.customType ?? "unknown"}\n\n${content}`;
  }

  if (entry.type === "model_change") {
    return `## ${timestamp} model_change\n\n${entry.provider ?? "unknown"}/${entry.modelId ?? "unknown"}`;
  }

  if (entry.type === "thinking_level_change") {
    return `## ${timestamp} thinking_level_change\n\n${entry.thinkingLevel ?? "unknown"}`;
  }

  if (entry.type === "session_info") {
    return `## ${timestamp} session_info\n\nName: ${redact(String(entry.name ?? ""))}`;
  }

  return undefined;
}

function renderMessage(timestamp, message, maxEntryChars) {
  if (message.role === "assistant") {
    return `## ${timestamp} assistant\n\n${assistantContentToText(message.content, maxEntryChars)}`;
  }

  if (message.role === "user") {
    return `## ${timestamp} user\n\n${contentToText(message.content, maxEntryChars)}`;
  }

  if (message.role === "toolResult") {
    const status = message.isError ? "error" : "ok";
    return `## ${timestamp} toolResult:${message.toolName ?? "unknown"} (${status})\n\n${contentToText(message.content, maxEntryChars)}`;
  }

  if (message.role === "bashExecution") {
    const status = message.cancelled ? "cancelled" : `exit ${message.exitCode ?? "unknown"}`;
    const output = truncate(redact(String(message.output ?? "")), maxEntryChars);
    return `## ${timestamp} bashExecution (${status})\n\n\`\`\`bash\n${redact(String(message.command ?? ""))}\n\`\`\`\n\n${output}`;
  }

  if (message.role === "custom") {
    return `## ${timestamp} custom:${message.customType ?? "unknown"}\n\n${contentToText(message.content, maxEntryChars)}`;
  }

  if (message.role === "branchSummary") {
    return `## ${timestamp} branchSummary\n\n${truncate(redact(String(message.summary ?? "")), maxEntryChars)}`;
  }

  if (message.role === "compactionSummary") {
    return `## ${timestamp} compactionSummary\n\n${truncate(redact(String(message.summary ?? "")), maxEntryChars)}`;
  }

  return `## ${timestamp} ${message.role ?? "message"}\n\n${truncate(redact(JSON.stringify(message)), maxEntryChars)}`;
}

function assistantContentToText(content, maxEntryChars) {
  if (!Array.isArray(content)) {
    return contentToText(content, maxEntryChars);
  }

  const parts = [];
  for (const block of content) {
    if (!block || typeof block !== "object") {
      continue;
    }

    if (block.type === "thinking") {
      parts.push("[assistant thinking omitted]");
      continue;
    }

    if (block.type === "toolCall") {
      const args = truncate(redact(JSON.stringify(block.arguments ?? {})), maxEntryChars);
      parts.push(`[tool call: ${block.name ?? "unknown"} ${args}]`);
      continue;
    }

    parts.push(blockToText(block));
  }

  return truncate(redact(parts.filter(Boolean).join("\n\n")), maxEntryChars);
}

function contentToText(content, maxEntryChars) {
  if (typeof content === "string") {
    return truncate(redact(content), maxEntryChars);
  }

  if (!Array.isArray(content)) {
    return truncate(redact(JSON.stringify(content ?? "")), maxEntryChars);
  }

  const text = content.map(blockToText).filter(Boolean).join("\n\n");
  return truncate(redact(text), maxEntryChars);
}

function blockToText(block) {
  if (!block || typeof block !== "object") {
    return "";
  }

  if (block.type === "text") {
    return String(block.text ?? "");
  }

  if (block.type === "image") {
    return `[image: ${block.mimeType ?? "unknown mime type"}]`;
  }

  if (block.type === "toolCall") {
    return `[tool call: ${block.name ?? "unknown"} ${JSON.stringify(block.arguments ?? {})}]`;
  }

  if (block.type === "thinking") {
    return "[assistant thinking omitted]";
  }

  return JSON.stringify(block);
}

function redact(text) {
  return String(text)
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gu, "Bearer [REDACTED]")
    .replace(/\bgh[pousr]_[A-Za-z0-9_]{20,}\b/gu, "[REDACTED_GITHUB_TOKEN]")
    .replace(/\bAKIA[0-9A-Z]{16}\b/gu, "[REDACTED_AWS_KEY]")
    .replace(/\bsk-[A-Za-z0-9]{20,}\b/gu, "[REDACTED_API_KEY]")
    .replace(
      /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/gu,
      "[REDACTED_JWT]",
    )
    .replace(
      /\b(api[_-]?key|token|secret|password|authorization)\b\s*[:=]\s*["']?[^\s"']{8,}/giu,
      "$1=[REDACTED]",
    );
}

function truncate(text, maxChars) {
  const value = String(text);
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars)}\n...[truncated ${value.length - maxChars} chars]`;
}

function formatDate(value) {
  if (typeof value === "number") {
    return new Date(value).toISOString();
  }

  if (typeof value === "string") {
    return value;
  }

  return "unknown";
}

function escapeCell(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
