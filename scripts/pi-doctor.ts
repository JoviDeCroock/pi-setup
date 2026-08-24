import { access } from "node:fs/promises";
import os from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { listFiles, readUtf8 } from "../packages/shared/src/index.js";
import {
  isJsonObject,
  renderAgentsTemplateText,
  renderSettingsTemplateText,
  validateDefaultPackagePolicy,
  validateManagedMcpConfig,
  validatePackageEntries,
  type JsonObject,
} from "../packages/pi-kit/src/index.js";

const repoRoot = resolve(fileURLToPath(new URL("../", import.meta.url)));

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

async function main(): Promise<void> {
  const agentHome = process.env.PI_AGENT_HOME || join(os.homedir(), ".pi", "agent");
  const templatePath = join(repoRoot, "config", "pi", "agent", "settings.template.json");
  const packagePolicyPath = join(repoRoot, "config", "pi", "agent", "package-policy.json");
  const agentDefinitionsDirectory = join(repoRoot, "config", "pi", "agent", "agents");
  const agentsTemplatePath = join(repoRoot, "config", "pi", "agent", "AGENTS.md");
  const mcpConfigPath = join(repoRoot, "config", "pi", "agent", "mcp.json");
  const privateSettingsOverlayPath = join(
    repoRoot,
    "config",
    "pi",
    "private",
    "settings.overlay.json",
  );
  const privateAgentContextPath = join(repoRoot, "config", "pi", "private", "agent-context.json");
  const packagePolicy = await readDefaultPackagePolicy(packagePolicyPath);
  const template = await readUtf8(templatePath);
  const agentsTemplate = await readUtf8(agentsTemplatePath);
  const privateSettingsOverlay = await readOptionalJsonObject(
    privateSettingsOverlayPath,
    "private settings overlay",
  );
  const privateAgentContext = await readOptionalPrivateAgentContext(privateAgentContextPath);
  const renderedAgents = renderAgentsTemplateText({
    ...(privateAgentContext?.vault ? { vault: privateAgentContext.vault } : {}),
    template: agentsTemplate,
  });
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
    { label: "private agent context", path: privateAgentContextPath, required: false },
    {
      label: "global Pi AGENTS template",
      path: agentsTemplatePath,
      required: true,
    },
    {
      label: "user agent directory",
      path: agentDefinitionsDirectory,
      required: true,
    },
    ...["sol", "terra", "luna"].map((name) => ({
      label: `user agent ${name}`,
      path: join(agentDefinitionsDirectory, `${name}.md`),
      required: true,
    })),
    { label: "Pi MCP config", path: mcpConfigPath, required: true },
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

  if (renderedAgents.includes("<VAULT>")) {
    failed = true;
    console.log("- [INVALID] AGENTS vault placeholder: rendered AGENTS.md still contains <VAULT>");
  } else {
    console.log(
      `- [${privateAgentContext?.vault ? "OK" : "OPTIONAL"}] AGENTS vault placeholder: ${
        privateAgentContext?.vault ? "configured" : "not configured"
      }`,
    );
  }

  const agentValidations = await validateAgents(agentDefinitionsDirectory);
  for (const validation of agentValidations) {
    const status = validation.ok ? "OK" : "INVALID";
    console.log(`- [${status}] user agent metadata: ${validation.path}`);

    if (!validation.ok) {
      failed = true;
      for (const problem of validation.problems) {
        console.log(`  ${problem}`);
      }
    }
  }

  const mcpValidation = await validateMcpConfig(mcpConfigPath);
  console.log(`- [${mcpValidation.ok ? "OK" : "INVALID"}] Notion MCP config: ${mcpConfigPath}`);
  if (!mcpValidation.ok) {
    failed = true;
    for (const problem of mcpValidation.problems) {
      console.log(`  ${problem}`);
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

async function validateAgents(agentsDirectory: string): Promise<AgentValidation[]> {
  if (!(await pathExists(agentsDirectory))) {
    return [];
  }

  const expectedModels = new Map([
    ["sol", "openai-codex/gpt-5.6-sol"],
    ["terra", "openai-codex/gpt-5.6-terra"],
    ["luna", "openai-codex/gpt-5.6-luna"],
  ]);
  const agentFiles = await listFiles(agentsDirectory, {
    include: (filePath) => filePath.endsWith(".md") && !filePath.endsWith(".chain.md"),
  });

  return Promise.all(
    agentFiles.map(async (agentPath) => {
      const content = await readUtf8(agentPath);
      const fields = parseFrontmatterFields(content);
      const problems: string[] = [];
      const expectedName = agentPath.split(/[/\\]/u).at(-1)?.replace(/\.md$/u, "");
      const declaredName = fields.get("name");

      if (!declaredName) {
        problems.push("Missing required `name` field.");
      } else if (declaredName !== expectedName) {
        problems.push(`\`name\` should match the agent filename \`${expectedName}\`.`);
      }

      if (!fields.get("description")) {
        problems.push("Missing required `description` field.");
      }

      const expectedModel = expectedName ? expectedModels.get(expectedName) : undefined;
      if (expectedModel && fields.get("model") !== expectedModel) {
        problems.push(`Expected model \`${expectedModel}\`.`);
      }

      if (fields.get("systemPromptMode") !== "append") {
        problems.push("Expected `systemPromptMode: append`.");
      }

      if (fields.get("inheritProjectContext") !== "true") {
        problems.push("Expected `inheritProjectContext: true`.");
      }

      if (fields.get("maxSubagentDepth") !== "0") {
        problems.push("Expected `maxSubagentDepth: 0`.");
      }

      return { ok: problems.length === 0, path: agentPath, problems };
    }),
  );
}

async function validateMcpConfig(mcpConfigPath: string): Promise<McpValidation> {
  if (!(await pathExists(mcpConfigPath))) {
    return { ok: false, problems: ["MCP config is missing."] };
  }

  try {
    return validateManagedMcpConfig(JSON.parse(await readUtf8(mcpConfigPath)) as unknown);
  } catch {
    return { ok: false, problems: ["MCP config is not valid JSON."] };
  }
}

function parseFrontmatterFields(content: string): Map<string, string> {
  const frontmatterMatch = /^---\r?\n([\s\S]*?)\r?\n---/u.exec(content);
  const fields = new Map<string, string>();
  if (!frontmatterMatch) {
    return fields;
  }

  for (const line of (frontmatterMatch[1] ?? "").split(/\r?\n/u)) {
    const fieldMatch = /^([A-Za-z][A-Za-z0-9]*):\s*(.*?)\s*$/u.exec(line);
    if (fieldMatch?.[1]) {
      fields.set(fieldMatch[1], fieldMatch[2] ?? "");
    }
  }
  return fields;
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

interface AgentValidation {
  ok: boolean;
  path: string;
  problems: string[];
}

interface McpValidation {
  ok: boolean;
  problems: string[];
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

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Unexpected doctor failure.");
  process.exitCode = 1;
});
