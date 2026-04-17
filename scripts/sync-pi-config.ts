import os from "node:os";
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";

import {
  copyDirectory,
  ensureDirectory,
  readUtf8,
  writeUtf8,
} from "../packages/shared/src/index.js";

interface CliOptions {
  dryRun: boolean;
  targetDirectory: string;
}

const repoRoot = resolve(fileURLToPath(new URL("../", import.meta.url)));

async function main(): Promise<void> {
  const options = parseCliOptions(process.argv.slice(2));
  const sourceRoot = join(repoRoot, "config", "pi", "agent");
  const promptsSource = join(sourceRoot, "prompts");
  const skillsSource = join(sourceRoot, "skills");
  const renderedSettings = await renderSettingsTemplate(
    join(sourceRoot, "settings.template.json"),
    repoRoot,
  );

  const extensionPaths = JSON.parse(renderedSettings) as { extensions?: string[] };
  const missingExtensions = await findMissingPaths(extensionPaths.extensions ?? []);

  if (options.dryRun) {
    console.log(`Pi config dry run`);
    console.log(`- Source: ${sourceRoot}`);
    console.log(`- Target: ${options.targetDirectory}`);
    console.log(`- Missing built extensions: ${missingExtensions.length}`);
    for (const missingPath of missingExtensions) {
      console.log(`  - ${missingPath}`);
    }
    return;
  }

  await ensureDirectory(options.targetDirectory);
  await copyDirectory(promptsSource, join(options.targetDirectory, "prompts"));
  await copyDirectory(skillsSource, join(options.targetDirectory, "skills"));
  await writeUtf8(
    join(options.targetDirectory, "AGENTS.md"),
    await readUtf8(join(sourceRoot, "AGENTS.md")),
  );
  await writeUtf8(join(options.targetDirectory, "settings.json"), renderedSettings);

  console.log(`Synced Pi config to ${options.targetDirectory}`);

  if (missingExtensions.length > 0) {
    console.log("");
    console.log("Warnings:");
    for (const missingPath of missingExtensions) {
      console.log(`- Missing built extension: ${missingPath}`);
    }
    console.log("- Run `pnpm build` to generate the referenced extension entry points.");
  }
}

function parseCliOptions(args: string[]): CliOptions {
  const defaultTarget = process.env.PI_AGENT_HOME || join(os.homedir(), ".pi", "agent");
  let targetDirectory = defaultTarget;
  let dryRun = false;

  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];

    if (current === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (current === "--target") {
      const candidate = args[index + 1];
      if (!candidate) {
        throw new Error("Expected a directory path after --target.");
      }

      targetDirectory = resolve(candidate);
      index += 1;
    }
  }

  return { dryRun, targetDirectory };
}

async function renderSettingsTemplate(
  templatePath: string,
  workspaceRoot: string,
): Promise<string> {
  const template = await readUtf8(templatePath);
  const escapedWorkspaceRoot = JSON.stringify(workspaceRoot).slice(1, -1);
  return `${template.replaceAll("__PI_SETUP_ROOT__", escapedWorkspaceRoot)}\n`;
}

async function findMissingPaths(paths: string[]): Promise<string[]> {
  const missing: string[] = [];

  for (const candidatePath of paths) {
    try {
      await access(candidatePath);
    } catch {
      missing.push(candidatePath);
    }
  }

  return missing;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Unexpected sync failure.");
  process.exitCode = 1;
});
