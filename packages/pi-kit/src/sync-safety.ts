import { realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

export async function pathIsAtOrWithin(candidate: string, parent: string): Promise<boolean> {
  const canonicalCandidate = await canonicalPath(candidate);
  const canonicalParent = await canonicalPath(parent);
  const relativePath = relative(canonicalParent, canonicalCandidate);
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

export function isSafeManagedAgentPath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.endsWith(".md") &&
    !value.includes("/") &&
    !value.includes("\\") &&
    value !== "." &&
    value !== ".." &&
    /^[A-Za-z0-9._-]+$/u.test(value)
  );
}

async function canonicalPath(candidatePath: string): Promise<string> {
  const absolutePath = resolve(candidatePath);
  try {
    return await realpath(absolutePath);
  } catch {
    const parentPath = dirname(absolutePath);
    if (parentPath === absolutePath) {
      return absolutePath;
    }
    return join(await canonicalPath(parentPath), basename(absolutePath));
  }
}
