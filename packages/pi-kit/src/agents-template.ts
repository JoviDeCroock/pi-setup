export interface RenderAgentsTemplateOptions {
  template: string;
  vault?: string;
}

const OPTIONAL_VAULT_BLOCK_PATTERN =
  /^[ \t]*<!--\s*pi:if-vault\s*-->\r?\n([\s\S]*?)\r?\n^[ \t]*<!--\s*\/pi:if-vault\s*-->\r?\n?/gmu;
const VAULT_PLACEHOLDER = "<VAULT>";

export function renderAgentsTemplateText(options: RenderAgentsTemplateOptions): string {
  const vault = options.vault?.trim();
  const rendered = options.template.replace(
    OPTIONAL_VAULT_BLOCK_PATTERN,
    (_block, content: string) => {
      if (!vault) {
        return "";
      }

      const normalizedContent = trimOptionalBlockPadding(content);
      return `${normalizedContent.replaceAll(VAULT_PLACEHOLDER, vault)}\n`;
    },
  );

  if (rendered.includes(VAULT_PLACEHOLDER)) {
    throw new Error(
      `Rendered AGENTS.md still contains ${VAULT_PLACEHOLDER}; configure a vault or wrap the placeholder in a pi:if-vault block.`,
    );
  }

  return rendered;
}

function trimOptionalBlockPadding(content: string): string {
  return content.replace(/^(?:[ \t]*\r?\n)+/u, "").replace(/(?:\r?\n[ \t]*)+$/u, "");
}
