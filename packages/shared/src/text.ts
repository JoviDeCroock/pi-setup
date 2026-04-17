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

  const normalized = text.toLowerCase();
  let score = 0;

  for (const token of tokens) {
    if (!normalized.includes(token)) {
      continue;
    }

    const exactMatches = normalized.split(token).length - 1;
    score += Math.max(1, exactMatches);
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
  const lines = content.split(/\r?\n/);
  if (lines.length === 0) {
    return "";
  }

  if (tokens.length === 0) {
    return lines.slice(0, maxLines).join("\n");
  }

  const normalizedTokens = tokens.map((token) => token.toLowerCase());
  const matchedIndices = new Set<number>();

  lines.forEach((line, index) => {
    const normalized = line.toLowerCase();
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
    return lines.slice(0, maxLines).join("\n");
  }

  return selectedIndices
    .slice(0, maxLines)
    .map((index) => lines[index] ?? "")
    .join("\n");
}

export function formatMarkdownList(items: string[]): string {
  return items.map((item) => `- ${item}`).join("\n");
}
