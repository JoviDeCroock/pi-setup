import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import os from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { listFiles, readUtf8 } from "../packages/shared/src/index.js";
import {
  isJsonObject,
  renderSettingsTemplateText,
  validateDefaultPackagePolicy,
  validatePackageEntries,
  type JsonObject,
} from "../packages/pi-kit/src/index.js";

const execFileAsync = promisify(execFile);

const repoRoot = resolve(fileURLToPath(new URL("../", import.meta.url)));

interface DefaultPackagePolicy {
  minimumReleaseAgeDays: number;
  packages: Array<{
    extensions?: string[];
    publishedAt?: string;
    source?: string;
  }>;
}

async function main(): Promise<void> {
  const agentHome = process.env.PI_AGENT_HOME || join(os.homedir(), ".pi", "agent");
  const templatePath = join(repoRoot, "config", "pi", "agent", "settings.template.json");
  const packagePolicyPath = join(repoRoot, "config", "pi", "agent", "package-policy.json");
  const privateSettingsOverlayPath = join(
    repoRoot,
    "config",
    "pi",
    "private",
    "settings.overlay.json",
  );
  const packagePolicy = await readDefaultPackagePolicy(packagePolicyPath);
  const template = await readUtf8(templatePath);
  const privateSettingsOverlay = await readOptionalJsonObject(privateSettingsOverlayPath);
  const rendered = renderSettingsTemplateText({
    defaultPackages: packagePolicy.packages,
    ...(privateSettingsOverlay ? { overlay: privateSettingsOverlay } : {}),
    template,
    workspaceRoot: repoRoot,
  });
  const settings = JSON.parse(rendered) as {
    extensions?: string[];
    packages?: Array<{
      extensions?: string[];
      source?: string;
    }>;
  };

  const checks = [
    { label: "repo AGENTS", path: join(repoRoot, "AGENTS.md"), required: true },
    { label: "Pi settings template", path: templatePath, required: true },
    { label: "Pi package policy", path: packagePolicyPath, required: true },
    { label: "private settings overlay", path: privateSettingsOverlayPath, required: false },
    {
      label: "global Pi AGENTS",
      path: join(repoRoot, "config", "pi", "agent", "AGENTS.md"),
      required: true,
    },
    {
      label: "prompt directory",
      path: join(repoRoot, "config", "pi", "agent", "prompts"),
      required: true,
    },
    {
      label: "skill directory",
      path: join(repoRoot, "config", "pi", "agent", "skills"),
      required: true,
    },
    { label: "installed Pi settings", path: join(agentHome, "settings.json"), required: false },
    ...(settings.extensions ?? []).map((path) => ({
      label: `built extension ${path.replace(`${repoRoot}\\`, "")}`,
      path,
      required: true,
    })),
  ];

  let failed = false;
  console.log(`Pi doctor for ${repoRoot}`);
  console.log(`Target Pi home: ${agentHome}`);
  console.log("");

  for (const check of checks) {
    const exists = await pathExists(check.path);
    const status = exists ? "OK" : check.required ? "MISSING" : "OPTIONAL";
    console.log(`- [${status}] ${check.label}: ${check.path}`);

    if (check.required && !exists) {
      failed = true;
    }
  }

  const skillValidations = await validateSkills(join(repoRoot, "config", "pi", "agent", "skills"));
  for (const validation of skillValidations) {
    const status = validation.ok ? "OK" : "INVALID";
    console.log(`- [${status}] skill metadata: ${validation.path}`);

    if (!validation.ok) {
      failed = true;
      for (const problem of validation.problems) {
        console.log(`  ${problem}`);
      }
    }
  }

  const defaultPackageValidations = validateDefaultPackagePolicy(packagePolicy);
  for (const validation of defaultPackageValidations) {
    const status = validation.ok ? "OK" : "INVALID";
    console.log(`- [${status}] default package policy: ${validation.label}`);

    if (!validation.ok) {
      failed = true;
      for (const problem of validation.problems) {
        console.log(`  ${problem}`);
      }
    }
  }

  const packageValidations = validatePackageEntries(settings.packages ?? []);
  for (const validation of packageValidations) {
    const status = validation.ok ? "OK" : "INVALID";
    console.log(`- [${status}] package entry: ${validation.label}`);

    if (!validation.ok) {
      failed = true;
      for (const problem of validation.problems) {
        console.log(`  ${problem}`);
      }
    }
  }

  const rtkStatus = await probeRtk();
  console.log(`- [${rtkStatus.ok ? "OK" : "OPTIONAL"}] rtk CLI: ${rtkStatus.detail}`);

  if (failed) {
    console.log("");
    console.log("One or more Pi setup checks failed.");
    console.log("Recommended next steps:");
    console.log("- Run `pnpm build` if extension entry points are missing.");
    console.log("- Run `pnpm pi:sync` to install the generated Pi config.");
    process.exitCode = 1;
    return;
  }

  console.log("");
  console.log("Pi doctor passed.");
}

async function pathExists(candidatePath: string): Promise<boolean> {
  try {
    await access(candidatePath);
    return true;
  } catch {
    return false;
  }
}

async function validateSkills(skillsDirectory: string): Promise<SkillValidation[]> {
  if (!(await pathExists(skillsDirectory))) {
    return [];
  }

  const skillFiles = await listFiles(skillsDirectory, {
    include: (filePath) => filePath.endsWith("SKILL.md"),
  });

  const validations: SkillValidation[] = [];

  for (const skillPath of skillFiles) {
    const content = await readUtf8(skillPath);
    const problems: string[] = [];
    const frontmatterMatch = /^---\r?\n([\s\S]*?)\r?\n---/u.exec(content);

    if (!frontmatterMatch) {
      validations.push({
        ok: false,
        path: skillPath,
        problems: ["Missing YAML frontmatter at the top of the file."],
      });
      continue;
    }

    const frontmatter = frontmatterMatch[1] ?? "";
    const nameMatch = /^name:\s*(.+)\s*$/mu.exec(frontmatter);
    const descriptionMatch = /^description:\s*(.+)\s*$/mu.exec(frontmatter);
    const declaredName = nameMatch?.[1]?.trim();
    const declaredDescription = descriptionMatch?.[1]?.trim();

    if (!declaredName) {
      problems.push("Missing required `name` field.");
    } else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(declaredName)) {
      problems.push("`name` must use lowercase letters, numbers, and hyphens only.");
    }

    if (!declaredDescription) {
      problems.push("Missing required `description` field.");
    }

    const expectedName = dirname(skillPath).split(/[/\\]/u).at(-1);
    if (expectedName && declaredName && declaredName !== expectedName) {
      problems.push(`\`name\` should match the skill directory name \`${expectedName}\`.`);
    }

    validations.push({
      ok: problems.length === 0,
      path: skillPath,
      problems,
    });
  }

  return validations;
}

interface SkillValidation {
  ok: boolean;
  path: string;
  problems: string[];
}

async function readDefaultPackagePolicy(policyPath: string): Promise<DefaultPackagePolicy> {
  const rawPolicy = await readUtf8(policyPath);
  return JSON.parse(rawPolicy) as DefaultPackagePolicy;
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

async function probeRtk(): Promise<{ detail: string; ok: boolean }> {
  const notInstalledHint =
    "not on PATH (optional — install from https://github.com/rtk-ai/rtk to prune command tokens)";

  try {
    const result = await execFileAsync("rtk", ["--version"], { timeout: 5_000 });
    const version = result.stdout.trim() || "installed";
    return { detail: `found (${version})`, ok: true };
  } catch (error) {
    const code = (error as { code?: number | string }).code;

    if (code === "ENOENT" || code === "ENOTDIR") {
      return { detail: notInstalledHint, ok: false };
    }

    const message = (error as { message?: string }).message ?? "";
    if (
      /not recognized|not found/iu.test(message) ||
      /ENOENT/u.test(message) // PowerShell wrappers sometimes surface the code only in the message
    ) {
      return { detail: notInstalledHint, ok: false };
    }

    return {
      detail: `\`rtk --version\` failed (${code ?? "unknown"}); reinstall may be needed.`,
      ok: false,
    };
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Unexpected doctor failure.");
  process.exitCode = 1;
});
