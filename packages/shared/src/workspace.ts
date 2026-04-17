import { access } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

import { listFiles, readUtf8, toPortablePath } from "./fs.js";
import { readJsonFile } from "./json.js";

const DEFAULT_MARKERS = ["pnpm-workspace.yaml", ".git"];

export interface PackageSummary {
  description?: string;
  name: string;
  path: string;
  private?: boolean;
}

export async function findWorkspaceRoot(
  startPath: string,
  markers: string[] = DEFAULT_MARKERS,
): Promise<string> {
  let currentPath = resolve(startPath);

  for (;;) {
    for (const marker of markers) {
      if (await pathExists(join(currentPath, marker))) {
        return currentPath;
      }
    }

    const parentPath = dirname(currentPath);
    if (parentPath === currentPath) {
      return resolve(startPath);
    }

    currentPath = parentPath;
  }
}

export async function discoverWorkspacePackages(rootPath: string): Promise<PackageSummary[]> {
  const packageJsonFiles = await listFiles(rootPath, {
    include: (filePath) => basename(filePath) === "package.json",
  });

  const packages: PackageSummary[] = [];

  for (const packageJsonPath of packageJsonFiles) {
    const relativePath = toPortablePath(dirname(packageJsonPath), rootPath);

    if (relativePath === "." || relativePath.startsWith("node_modules/")) {
      continue;
    }

    const manifest = await readJsonFile<{
      description?: string;
      name?: string;
      private?: boolean;
    }>(packageJsonPath);

    if (!manifest.name) {
      continue;
    }

    packages.push({
      ...(manifest.description ? { description: manifest.description } : {}),
      ...(manifest.private !== undefined ? { private: manifest.private } : {}),
      name: manifest.name,
      path: relativePath,
    });
  }

  packages.sort((left, right) => left.path.localeCompare(right.path));
  return packages;
}

export async function readWorkspaceReadme(rootPath: string): Promise<string | undefined> {
  const candidatePath = join(rootPath, "README.md");
  if (!(await pathExists(candidatePath))) {
    return undefined;
  }

  return readUtf8(candidatePath);
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
