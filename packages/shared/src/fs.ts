import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

const DEFAULT_IGNORED_DIRECTORIES = new Set([".git", ".turbo", "coverage", "dist", "node_modules"]);

export interface ListFilesOptions {
  ignoredDirectories?: Iterable<string>;
  include?: (filePath: string) => boolean;
}

export async function ensureDirectory(directoryPath: string): Promise<void> {
  await mkdir(directoryPath, { recursive: true });
}

export async function readUtf8(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

export async function writeUtf8(filePath: string, content: string): Promise<void> {
  await ensureDirectory(dirname(filePath));
  await writeFile(filePath, content, "utf8");
}

export async function copyDirectory(sourcePath: string, targetPath: string): Promise<void> {
  await ensureDirectory(targetPath);
  await cp(sourcePath, targetPath, { recursive: true, force: true });
}

export async function removePath(targetPath: string): Promise<void> {
  await rm(targetPath, { force: true, recursive: true });
}

export async function listFiles(
  rootDirectory: string,
  options: ListFilesOptions = {},
): Promise<string[]> {
  const ignoredDirectories = new Set(options.ignoredDirectories ?? DEFAULT_IGNORED_DIRECTORIES);
  const discovered: string[] = [];

  async function walk(currentDirectory: string): Promise<void> {
    const entries = await readdir(currentDirectory, { withFileTypes: true });

    for (const entry of entries) {
      const nextPath = resolve(currentDirectory, entry.name);

      if (entry.isDirectory()) {
        if (ignoredDirectories.has(entry.name)) {
          continue;
        }

        await walk(nextPath);
        continue;
      }

      if (!options.include || options.include(nextPath)) {
        discovered.push(nextPath);
      }
    }
  }

  await walk(resolve(rootDirectory));
  discovered.sort((left, right) => left.localeCompare(right));
  return discovered;
}

export function toPortablePath(filePath: string, basePath?: string): string {
  const value = basePath ? relative(basePath, filePath) : filePath;
  return value.split("\\").join("/");
}
