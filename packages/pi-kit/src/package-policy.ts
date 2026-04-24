export interface PiPackageEntry {
  source?: string;
  extensions?: string[];
  publishedAt?: string;
}

export interface DefaultPackagePolicy {
  minimumReleaseAgeDays: number;
  packages: PiPackageEntry[];
}

export interface PolicyValidation {
  label: string;
  ok: boolean;
  problems: string[];
}

const EXACT_SEMVER_PATTERN = /^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z-.]+)?(?:\+[0-9A-Za-z-.]+)?$/u;

export function validatePackageEntries(packages: PiPackageEntry[]): PolicyValidation[] {
  return packages.map((entry, index) => {
    const problems: string[] = [];
    const source = entry.source?.trim();

    if (!source) {
      problems.push("Missing required `source` field.");
    } else if (!isSupportedPackageSource(source)) {
      problems.push("`source` should use a supported package prefix such as `npm:` or `git:`.");
    } else if (source.startsWith("npm:") && !isPinnedNpmSource(source)) {
      problems.push("`npm:` sources must pin an exact version like `npm:pkg@1.2.3`.");
    }

    if (
      entry.extensions &&
      entry.extensions.some(
        (extensionPath) => typeof extensionPath !== "string" || extensionPath.length === 0,
      )
    ) {
      problems.push("`extensions` must be a non-empty string array when provided.");
    }

    return {
      label: source ?? `package[${index}]`,
      ok: problems.length === 0,
      problems,
    };
  });
}

export function validateDefaultPackagePolicy(
  policy: DefaultPackagePolicy,
  now: Date = new Date(),
): PolicyValidation[] {
  const validations: PolicyValidation[] = [];
  const duplicateNames = findDuplicateNpmPackageNames(policy.packages);

  if (!Number.isInteger(policy.minimumReleaseAgeDays) || policy.minimumReleaseAgeDays < 0) {
    validations.push({
      label: "package policy",
      ok: false,
      problems: ["`minimumReleaseAgeDays` must be a non-negative integer."],
    });
  }

  if (!Array.isArray(policy.packages) || policy.packages.length === 0) {
    validations.push({
      label: "package policy",
      ok: false,
      problems: ["`packages` must contain at least one package entry."],
    });
    return validations;
  }

  for (const validation of validatePackageEntries(policy.packages)) {
    const entry = policy.packages.find(
      (candidate) => candidate.source?.trim() === validation.label,
    );
    const problems = [...validation.problems];
    const source = entry?.source?.trim();

    if (source?.startsWith("npm:")) {
      const publishedAt = entry?.publishedAt?.trim();

      if (!publishedAt) {
        problems.push("Pinned `npm:` entries must declare `publishedAt`.");
      } else {
        const publishedDate = new Date(publishedAt);

        if (Number.isNaN(publishedDate.getTime())) {
          problems.push("`publishedAt` must be a valid ISO-8601 timestamp.");
        } else if (publishedDate.getTime() > now.getTime()) {
          problems.push("`publishedAt` cannot be in the future.");
        } else {
          const minimumReleaseAgeMs = policy.minimumReleaseAgeDays * 24 * 60 * 60 * 1000;

          if (now.getTime() - publishedDate.getTime() < minimumReleaseAgeMs) {
            problems.push(
              `Published on ${publishedDate.toISOString()} but must age at least ${policy.minimumReleaseAgeDays} day(s).`,
            );
          }
        }
      }

      const packageName = parseNpmPackageSource(source)?.name;
      if (packageName && duplicateNames.has(packageName)) {
        problems.push(`Duplicate pinned package entry for \`${packageName}\`.`);
      }
    }

    validations.push({
      label: validation.label,
      ok: problems.length === 0,
      problems,
    });
  }

  return validations;
}

export function parseNpmPackageSource(
  source: string,
): { name: string; version: string | null } | null {
  if (!source.startsWith("npm:")) {
    return null;
  }

  return parseNpmPackageSpecifier(source.slice(4));
}

export function parseNpmPackageSpecifier(
  specifier: string,
): { name: string; version: string | null } | null {
  const trimmed = specifier.trim();
  if (!trimmed) {
    return null;
  }

  const separatorIndex = trimmed.lastIndexOf("@");
  if (separatorIndex <= 0) {
    return { name: trimmed, version: null };
  }

  return {
    name: trimmed.slice(0, separatorIndex),
    version: trimmed.slice(separatorIndex + 1),
  };
}

export function isPinnedNpmSource(source: string): boolean {
  const parsed = parseNpmPackageSource(source);
  return parsed !== null && isExactSemverVersion(parsed.version);
}

export function isExactSemverVersion(version: string | null | undefined): boolean {
  return typeof version === "string" && EXACT_SEMVER_PATTERN.test(version);
}

function isSupportedPackageSource(source: string): boolean {
  return (
    source.startsWith("npm:") ||
    source.startsWith("git:") ||
    source.startsWith("http://") ||
    source.startsWith("https://")
  );
}

function findDuplicateNpmPackageNames(packages: PiPackageEntry[]): Set<string> {
  const counts = new Map<string, number>();

  for (const entry of packages) {
    const source = entry.source?.trim();
    if (!source?.startsWith("npm:")) {
      continue;
    }

    const packageName = parseNpmPackageSource(source)?.name;
    if (!packageName) {
      continue;
    }

    counts.set(packageName, (counts.get(packageName) ?? 0) + 1);
  }

  return new Set(
    [...counts.entries()].filter(([, count]) => count > 1).map(([packageName]) => packageName),
  );
}
