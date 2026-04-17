import os from "node:os";
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

import { listFiles, readUtf8 } from "../packages/shared/src/index.js";

const repoRoot = resolve(fileURLToPath(new URL("../", import.meta.url)));

async function main(): Promise<void> {
  const agentHome = process.env.PI_AGENT_HOME || join(os.homedir(), ".pi", "agent");
  const templatePath = join(repoRoot, "config", "pi", "agent", "settings.template.json");
  const template = await readUtf8(templatePath);
  const rendered = template.replaceAll("__PI_SETUP_ROOT__", JSON.stringify(repoRoot).slice(1, -1));
  const settings = JSON.parse(rendered) as { extensions?: string[] };

  const checks = [
    { label: "repo AGENTS", path: join(repoRoot, "AGENTS.md"), required: true },
    { label: "Pi settings template", path: templatePath, required: true },
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

  if (failed) {
    console.log("");
    console.log("One or more required files are missing.");
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

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Unexpected doctor failure.");
  process.exitCode = 1;
});
