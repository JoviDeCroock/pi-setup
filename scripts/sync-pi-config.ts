import { randomUUID } from "node:crypto";
import { access, lstat, rename, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  copyDirectory,
  ensureDirectory,
  listFiles,
  readUtf8,
  removePath,
} from "../packages/shared/src/index.js";
import {
  isJsonObject,
  isSafeManagedAgentPath,
  pathIsAtOrWithin,
  renderAgentsTemplateText,
  renderSettingsTemplateText,
  validateDefaultPackagePolicy,
  validateManagedMcpConfig,
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

interface PrivateAgentContext {
  vault?: string;
}

const repoRoot = resolve(fileURLToPath(new URL("../", import.meta.url)));
const MANAGED_AGENT_MANIFEST = ".pi-setup-managed-agents.json";

async function main(): Promise<void> {
  const options = parseCliOptions(process.argv.slice(2));
  const sourceRoot = join(repoRoot, "config", "pi", "agent");
  const agentsSource = join(sourceRoot, "agents");
  const mcpConfigPath = join(sourceRoot, "mcp.json");
  const promptsSource = join(sourceRoot, "prompts");
  const skillsSource = join(sourceRoot, "skills");
  const agentsTemplatePath = join(sourceRoot, "AGENTS.md");

  if (await pathIsAtOrWithin(options.targetDirectory, sourceRoot)) {
    throw new Error("Refusing to sync the managed Pi config into its source directory tree.");
  }
  await assertSafeSyncTargetDirectory(options.targetDirectory);
  const privateSettingsOverlayPath = join(
    repoRoot,
    "config",
    "pi",
    "private",
    "settings.overlay.json",
  );
  const privateAgentContextPath = join(repoRoot, "config", "pi", "private", "agent-context.json");
  const defaultPackagePolicy = await readDefaultPackagePolicy(
    join(sourceRoot, "package-policy.json"),
  );
  const privateSettingsOverlay = await readOptionalJsonObject(
    privateSettingsOverlayPath,
    "private settings overlay",
  );
  const privateAgentContext = await readOptionalPrivateAgentContext(privateAgentContextPath);
  const renderedAgents = await renderAgentsTemplate(agentsTemplatePath, privateAgentContext);
  const mcpConfig = await readManagedMcpConfig(mcpConfigPath);
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
    console.log(
      `- Private agent context: ${privateAgentContext ? privateAgentContextPath : "none"}`,
    );
    console.log(
      `- Vault placeholder: ${privateAgentContext?.vault ? "configured" : "not configured"}`,
    );
    console.log(`- User agents: ${agentsSource}`);
    console.log(`- MCP config: ${mcpConfigPath} (${Object.keys(mcpConfig).length} root keys)`);
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
  await syncManagedAgents(agentsSource, join(options.targetDirectory, "agents"));
  await copyDirectory(promptsSource, join(options.targetDirectory, "prompts"));
  await copyDirectory(skillsSource, join(options.targetDirectory, "skills"));
  await writeManagedFile(join(options.targetDirectory, "AGENTS.md"), renderedAgents);
  await writeManagedFile(
    join(options.targetDirectory, "mcp.json"),
    `${JSON.stringify(mcpConfig, null, 2)}\n`,
  );
  await writeManagedFile(join(options.targetDirectory, "settings.json"), renderedSettings);

  console.log(`Synced Pi config to ${options.targetDirectory}`);

  if (privateSettingsOverlay) {
    console.log(`Applied private settings overlay: ${privateSettingsOverlayPath}`);
  }

  if (privateAgentContext?.vault) {
    console.log(`Rendered AGENTS.md vault placeholder from: ${privateAgentContextPath}`);
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

async function renderAgentsTemplate(
  templatePath: string,
  privateAgentContext: PrivateAgentContext | undefined,
): Promise<string> {
  const template = await readUtf8(templatePath);

  return renderAgentsTemplateText({
    ...(privateAgentContext?.vault ? { vault: privateAgentContext.vault } : {}),
    template,
  });
}

async function assertSafeSyncTargetDirectory(directoryPath: string): Promise<void> {
  try {
    const stats = await lstat(directoryPath);
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      throw new Error(`Pi sync target must be a real directory: ${directoryPath}`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

async function writeManagedFile(filePath: string, content: string): Promise<void> {
  await ensureDirectory(dirname(filePath));
  const temporaryPath = join(dirname(filePath), `.${basename(filePath)}.${randomUUID()}.tmp`);

  try {
    await writeFile(temporaryPath, content, { encoding: "utf8", flag: "wx", mode: 0o600 });
    await replaceManagedFile(temporaryPath, filePath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

async function replaceManagedFile(temporaryPath: string, filePath: string): Promise<void> {
  try {
    await rename(temporaryPath, filePath);
    return;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EEXIST" && code !== "EPERM") {
      throw error;
    }
  }

  const destinationStats = await lstat(filePath);
  if (destinationStats.isDirectory()) {
    throw new Error(`Managed Pi destination must not be a directory: ${filePath}`);
  }

  const backupPath = join(dirname(filePath), `.${basename(filePath)}.${randomUUID()}.backup`);
  await rename(filePath, backupPath);
  try {
    await rename(temporaryPath, filePath);
  } catch (error) {
    await rename(backupPath, filePath);
    throw error;
  }
  await unlink(backupPath);
}

async function syncManagedAgents(sourceDirectory: string, targetDirectory: string): Promise<void> {
  await assertSafeManagedAgentDirectory(targetDirectory);
  const manifestPath = join(targetDirectory, MANAGED_AGENT_MANIFEST);
  const previousManagedPaths = await readManagedAgentManifest(manifestPath);
  const managedPaths = (await listFiles(sourceDirectory)).map((filePath) =>
    relative(sourceDirectory, filePath).split(sep).join("/"),
  );

  if (managedPaths.some((managedPath) => !isSafeManagedAgentPath(managedPath))) {
    throw new Error("Managed user-agent definitions must be flat `.md` files.");
  }

  for (const managedPath of previousManagedPaths) {
    await removeManagedAgentFile(join(targetDirectory, managedPath));
  }
  for (const managedPath of managedPaths) {
    await removeManagedAgentFile(join(targetDirectory, managedPath));
  }

  await copyDirectory(sourceDirectory, targetDirectory);
  await writeManagedFile(manifestPath, `${JSON.stringify(managedPaths.sort(), null, 2)}\n`);
}

async function assertSafeManagedAgentDirectory(directoryPath: string): Promise<void> {
  try {
    const stats = await lstat(directoryPath);
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      throw new Error(`Managed agents target must be a real directory: ${directoryPath}`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

async function removeManagedAgentFile(filePath: string): Promise<void> {
  try {
    const stats = await lstat(filePath);
    if (!stats.isFile() && !stats.isSymbolicLink()) {
      throw new Error(`Refusing to remove a non-file managed agent path: ${filePath}`);
    }
    await unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

async function readManagedAgentManifest(manifestPath: string): Promise<string[]> {
  let stats;
  try {
    stats = await lstat(manifestPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }

  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw new Error(`Managed-agent manifest must be a real file: ${manifestPath}`);
  }

  const parsed = JSON.parse(await readUtf8(manifestPath)) as unknown;
  if (!Array.isArray(parsed) || parsed.some((entry) => !isSafeManagedAgentPath(entry))) {
    throw new Error(`Invalid managed-agent manifest: ${manifestPath}`);
  }

  return parsed;
}

async function readManagedMcpConfig(configPath: string): Promise<JsonObject> {
  const parsed = JSON.parse(await readUtf8(configPath)) as unknown;
  const validation = validateManagedMcpConfig(parsed);
  if (!validation.ok || !isJsonObject(parsed)) {
    throw new Error(
      [
        `Invalid managed MCP config: ${configPath}`,
        ...validation.problems.map((p) => `- ${p}`),
      ].join("\n"),
    );
  }
  return parsed;
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

async function readOptionalJsonObject(
  filePath: string,
  label: string,
): Promise<JsonObject | undefined> {
  if (!(await pathExists(filePath))) {
    return undefined;
  }

  const parsed = JSON.parse(await readUtf8(filePath)) as unknown;
  if (!isJsonObject(parsed)) {
    throw new Error(`Expected ${label} to be a JSON object: ${filePath}`);
  }

  return parsed;
}

async function readOptionalPrivateAgentContext(
  filePath: string,
): Promise<PrivateAgentContext | undefined> {
  const parsed = await readOptionalJsonObject(filePath, "private agent context");
  if (!parsed) {
    return undefined;
  }

  const vault = parsed["vault"];
  if (vault === undefined) {
    return {};
  }

  if (typeof vault !== "string" || vault.trim().length === 0) {
    throw new Error(
      `Expected private agent context \`vault\` to be a non-empty string: ${filePath}`,
    );
  }

  return { vault: vault.trim() };
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
