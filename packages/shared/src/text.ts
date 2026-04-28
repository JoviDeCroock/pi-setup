export function tokenizeQuery(input: string): string[] {
  return Array.from(
    new Set(
      input
        .toLowerCase()
        .split(/[^a-z0-9_-]+/i)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2),
    ),
  );
}

export function scoreTextAgainstQuery(text: string, tokens: string[]): number {
  if (tokens.length === 0) {
    return 0;
  }

  const normalized = normalizeSearchText(text);
  const compact = normalized.replace(/[\s/_-]+/g, "");
  const phrase = normalizeSearchText(tokens.join(" "));
  let score = phrase && normalized.includes(phrase) ? tokens.length * 3 : 0;

  for (const token of tokens) {
    const forms = expandTokenForms(token);
    let tokenScore = 0;

    for (const form of forms) {
      const wholeMatches = countWholeTermMatches(normalized, form);
      const substringMatches = countSubstringMatches(normalized, form);
      tokenScore = Math.max(
        tokenScore,
        wholeMatches * 4 + Math.max(0, substringMatches - wholeMatches),
      );
    }

    const compactToken = normalizeSearchText(token).replace(/[\s/_-]+/g, "");
    if (compactToken.length >= 2 && compact.includes(compactToken)) {
      tokenScore = Math.max(tokenScore, 2);
    }

    score += Math.min(tokenScore, 20);
  }

  return score;
}

export function truncate(input: string, maxLength: number): string {
  if (input.length <= maxLength) {
    return input;
  }

  return `${input.slice(0, Math.max(0, maxLength - 1))}…`;
}

export function excerptMatchingLines(content: string, tokens: string[], maxLines = 14): string {
  return formatExcerptLines(content, selectExcerptLineIndices(content, tokens, maxLines), false);
}

export function excerptMatchingLinesWithLineNumbers(
  content: string,
  tokens: string[],
  maxLines = 14,
): string {
  return formatExcerptLines(content, selectExcerptLineIndices(content, tokens, maxLines), true);
}

export function formatMarkdownList(items: string[]): string {
  return items.map((item) => `- ${item}`).join("\n");
}

function selectExcerptLineIndices(content: string, tokens: string[], maxLines: number): number[] {
  const lines = content.split(/\r?\n/);
  if (lines.length === 0) {
    return [];
  }

  if (tokens.length === 0) {
    return lines.slice(0, maxLines).map((_, index) => index);
  }

  const normalizedTokens = tokens.flatMap((token) => expandTokenForms(token));
  const matchedIndices = new Set<number>();

  lines.forEach((line, index) => {
    const normalized = normalizeSearchText(line);
    if (normalizedTokens.some((token) => normalized.includes(token))) {
      matchedIndices.add(index);
      if (index > 0) {
        matchedIndices.add(index - 1);
      }
      if (index < lines.length - 1) {
        matchedIndices.add(index + 1);
      }
    }
  });

  const selectedIndices = Array.from(matchedIndices).sort((left, right) => left - right);
  if (selectedIndices.length === 0) {
    return lines.slice(0, maxLines).map((_, index) => index);
  }

  return selectedIndices.slice(0, maxLines);
}

function formatExcerptLines(content: string, indices: number[], withLineNumbers: boolean): string {
  const lines = content.split(/\r?\n/);

  if (!withLineNumbers) {
    return indices.map((index) => lines[index] ?? "").join("\n");
  }

  const width = String(Math.max(...indices.map((index) => index + 1), 1)).length;
  return indices
    .map((index) => `${String(index + 1).padStart(width, " ")} | ${lines[index] ?? ""}`)
    .join("\n");
}

function expandTokenForms(token: string): string[] {
  const normalized = normalizeSearchText(token);
  const spaced = normalized.replace(/[_-]+/g, " ");
  const parts = spaced.split(/\s+/).filter((part) => part.length >= 2);

  return Array.from(new Set([normalized, spaced, ...parts].filter((part) => part.length >= 2)));
}

function normalizeSearchText(input: string): string {
  return input.toLowerCase();
}

function countWholeTermMatches(text: string, term: string): number {
  const escaped = escapeRegExp(term);
  const matches = text.match(new RegExp(`(^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, "g"));
  return matches?.length ?? 0;
}

function countSubstringMatches(text: string, term: string): number {
  if (term.length === 0) {
    return 0;
  }

  return text.split(term).length - 1;
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
