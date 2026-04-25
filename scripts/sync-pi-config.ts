import { access } from "node:fs/promises";
import os from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  copyDirectory,
  ensureDirectory,
  readUtf8,
  removePath,
  writeUtf8,
} from "../packages/shared/src/index.js";
import {
  isJsonObject,
  renderSettingsTemplateText,
  validateDefaultPackagePolicy,
  type JsonObject,
} from "../packages/pi-kit/src/index.js";

interface CliOptions {
  allowMissingExtensions: boolean;
  dryRun: boolean;
  targetDirectory: string;
}

interface DefaultPackagePolicy {
  minimumReleaseAgeDays: number;
  packages: Array<{
    extensions?: string[];
    publishedAt?: string;
    source?: string;
  }>;
}

const repoRoot = resolve(fileURLToPath(new URL("../", import.meta.url)));

async function main(): Promise<void> {
  const options = parseCliOptions(process.argv.slice(2));
  const sourceRoot = join(repoRoot, "config", "pi", "agent");
  const promptsSource = join(sourceRoot, "prompts");
  const skillsSource = join(sourceRoot, "skills");
  const privateSettingsOverlayPath = join(
    repoRoot,
    "config",
    "pi",
    "private",
    "settings.overlay.json",
  );
  const defaultPackagePolicy = await readDefaultPackagePolicy(
    join(sourceRoot, "package-policy.json"),
  );
  const privateSettingsOverlay = await readOptionalJsonObject(privateSettingsOverlayPath);
  const renderedSettings = await renderSettingsTemplate(
    join(sourceRoot, "settings.template.json"),
    repoRoot,
    defaultPackagePolicy,
    privateSettingsOverlay,
  );

  const extensionPaths = JSON.parse(renderedSettings) as { extensions?: string[] };
  const missingExtensions = await findMissingPaths(extensionPaths.extensions ?? []);

  if (options.dryRun) {
    console.log(`Pi config dry run`);
    console.log(`- Source: ${sourceRoot}`);
    console.log(`- Target: ${options.targetDirectory}`);
    console.log(
      `- Private overlay: ${privateSettingsOverlay ? privateSettingsOverlayPath : "none"}`,
    );
    console.log(`- Missing built extensions: ${missingExtensions.length}`);
    for (const missingPath of missingExtensions) {
      console.log(`  - ${missingPath}`);
    }
    return;
  }

  if (missingExtensions.length > 0 && !options.allowMissingExtensions) {
    throw new Error(
      [
        "Refusing to sync settings with missing built extension entry points.",
        ...missingExtensions.map((missingPath) => `- ${missingPath}`),
        "Run `pnpm build`, or pass `--allow-missing-extensions` if you intentionally want a partial config.",
      ].join("\n"),
    );
  }

  await ensureDirectory(options.targetDirectory);
  await removePath(join(options.targetDirectory, "prompts"));
  await removePath(join(options.targetDirectory, "skills"));
  await copyDirectory(promptsSource, join(options.targetDirectory, "prompts"));
  await copyDirectory(skillsSource, join(options.targetDirectory, "skills"));
  await writeUtf8(
    join(options.targetDirectory, "AGENTS.md"),
    await readUtf8(join(sourceRoot, "AGENTS.md")),
  );
  await writeUtf8(join(options.targetDirectory, "settings.json"), renderedSettings);

  console.log(`Synced Pi config to ${options.targetDirectory}`);

  if (privateSettingsOverlay) {
    console.log(`Applied private settings overlay: ${privateSettingsOverlayPath}`);
  }
}

function parseCliOptions(args: string[]): CliOptions {
  const defaultTarget = process.env.PI_AGENT_HOME || join(os.homedir(), ".pi", "agent");
  let allowMissingExtensions = false;
  let targetDirectory = defaultTarget;
  let dryRun = false;

  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];

    if (current === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (current === "--allow-missing-extensions") {
      allowMissingExtensions = true;
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

  return { allowMissingExtensions, dryRun, targetDirectory };
}

async function renderSettingsTemplate(
  templatePath: string,
  workspaceRoot: string,
  defaultPackagePolicy: DefaultPackagePolicy,
  privateSettingsOverlay: JsonObject | undefined,
): Promise<string> {
  const template = await readUtf8(templatePath);

  return renderSettingsTemplateText({
    defaultPackages: defaultPackagePolicy.packages,
    ...(privateSettingsOverlay ? { overlay: privateSettingsOverlay } : {}),
    template,
    workspaceRoot,
  });
}

async function findMissingPaths(paths: string[]): Promise<string[]> {
  const missing: string[] = [];

  for (const candidatePath of paths) {
    if (!(await pathExists(candidatePath))) {
      missing.push(candidatePath);
    }
  }

  return missing;
}

async function readDefaultPackagePolicy(policyPath: string): Promise<DefaultPackagePolicy> {
  const rawPolicy = await readUtf8(policyPath);
  const policy = JSON.parse(rawPolicy) as DefaultPackagePolicy;
  const failures = validateDefaultPackagePolicy(policy).filter((validation) => !validation.ok);

  if (failures.length > 0) {
    throw new Error(formatPolicyProblems(policyPath, failures));
  }

  return policy;
}

async function readOptionalJsonObject(filePath: string): Promise<JsonObject | undefined> {
  if (!(await pathExists(filePath))) {
    return undefined;
  }

  const parsed = JSON.parse(await readUtf8(filePath)) as unknown;
  if (!isJsonObject(parsed)) {
    throw new Error(`Expected private settings overlay to be a JSON object: ${filePath}`);
  }

  return parsed;
}

async function pathExists(candidatePath: string): Promise<boolean> {
  try {
    await access(candidatePath);
    return true;
  } catch {
    return false;
  }
}

function formatPolicyProblems(
  policyPath: string,
  failures: Array<{ label: string; problems: string[] }>,
): string {
  const lines = [`Invalid package policy: ${policyPath}`];

  for (const failure of failures) {
    lines.push(`- ${failure.label}`);
    for (const problem of failure.problems) {
      lines.push(`  ${problem}`);
    }
  }

  return lines.join("\n");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Unexpected sync failure.");
  process.exitCode = 1;
});
