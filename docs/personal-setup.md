# Personal Setup

## Global Pi home

The intended global install target is:

```text
~/.pi/agent
```

Use the sync script to render and install the repo-managed config:

```bash
pnpm build
pnpm pi:sync
```

Useful variants:

```bash
pnpm pi:sync -- --dry-run
pnpm pi:sync -- --target C:\\temp\\pi-agent
```

Sync refuses to write settings that point at missing built extension entry points. Run `pnpm build` first, or pass `--allow-missing-extensions` only when you intentionally want a partial config.

`pnpm pi:sync` installs:

- a rendered `AGENTS.md` from `config/pi/agent/AGENTS.md`
- `config/pi/agent/agents/`
- `config/pi/agent/prompts/`
- `config/pi/agent/skills/`
- the secret-free `config/pi/agent/mcp.json`
- a rendered `settings.json` with absolute extension paths

The three tracked Sol/Terra/Luna definitions, prompts, skills, and MCP declaration are repository-authoritative. Sync tracks managed agent filenames in `agents/.pi-setup-managed-agents.json`, replaces only those files, and preserves unrelated user agents created through `/agents`. Copy intentional edits to Sol/Terra/Luna back into the repository before the next sync. Sync never touches OAuth credentials, `auth.json`, `trust.json`, MCP metadata caches, sessions, or run history.

The managed `AGENTS.md` is intentionally small: it carries always-on operating defaults and tells the agent to suggest a Pi skill when a session reveals a repeatable workflow, checklist, or specialized procedure.

It can also render an opt-in personal knowledge-capture line. Copy `config/pi/private/agent-context.example.json` to ignored `config/pi/private/agent-context.json`, then set a local vault:

```json
{
  "vault": "/Users/example/Documents/brain"
}
```

When `vault` exists, `pnpm pi:sync` includes the optional AGENTS instruction and replaces `<VAULT>` with that path, producing guidance to offer notes under `<VAULT>/00-inbox/`. Without `vault`, the line is omitted entirely.

Managed skills currently include:

- `agent-browser` for browser, web app, Electron, Slack, Vercel Sandbox, and AgentCore automation via the `agent-browser` CLI. This skill is the upstream built-in discovery stub from `agent-browser@0.26.0`; load `agent-browser skills get core` for version-matched workflow details.
- `agent-device` for Apple-platform, Android, TV, and desktop UI automation via the `agent-device` CLI. This skill is sourced from the upstream built-in `agent-device@0.13.3` skill and includes its local reference files.
  - `dogfood` and `react-devtools` are also copied from `agent-device@0.13.3` because `agent-device` references them for QA and React Native internals.
- `extension-maintainer` for maintaining this repository's Pi extensions with tests, docs, and verification.
- `session-lessons` for reviewing Pi session history, diagnosing repeated assistant mistakes, and drafting corrective skills or context updates.
- `project-notes` for searching and updating a canonical Notion project page without creating per-session logs.
- `pr-stewardship` for PR identity checks, semantic rebases, push safety, and CI follow-through.
- `adversarial-review` for challenging risky implementation claims with focused evidence.
- `web-dogfood` for browser and visual QA through `agent-browser`.

Managed user agents are:

- `sol` (`gpt-5.6-sol`) for ambiguous, cross-cutting, architecture-heavy, or high-risk work;
- `terra` (`gpt-5.6-terra`) for bounded implementation, debugging, refactoring, tests, and routine review;
- `luna` (`gpt-5.6-luna`) for read-only, well-scoped exploration and evidence gathering.

The rendered settings default the main session and otherwise-unspecified subagents to:

```json
{
  "defaultProvider": "openai-codex",
  "defaultModel": "gpt-5.6-sol",
  "defaultThinkingLevel": "high",
  "subagents": {
    "defaultModel": "openai-codex/gpt-5.6-terra"
  }
}
```

A subagent's explicit model override still takes precedence over `subagents.defaultModel`.

The settings also set `"npmCommand": ["pnpm"]`. That makes Pi run package-manager operations through `pnpm`. The package entries themselves still use `npm:` sources because that is Pi's package-source prefix.

The rendered global settings also declare curated package-based defaults. The pins live in `config/pi/agent/package-policy.json`, and every npm version there must be at least 7 days old before it is promoted:

- `npm:pi-powerline-footer`
- `npm:@tmustier/pi-usage-extension`
- `npm:pi-subagents` — async subagent delegation with chains, parallel execution, and TUI clarification
- `npm:pi-web-access` — `web_search`, `code_search`, `fetch_content`, and `get_search_content` tools (works zero-config via Exa MCP)
- `npm:pi-mcp-adapter` — a compact MCP proxy used for the tracked Notion connection

### Notion MCP authentication

Pi does not provide a native MCP client, so the setup installs `pi-mcp-adapter` and keeps Notion proxy-only to avoid adding every Notion schema to the system prompt. After sync, restart Pi or run `/reload`, then authenticate once:

```text
/mcp-auth notion
```

You can also open `/mcp`, select `notion`, and start OAuth there. The tracked endpoint is `https://mcp.notion.com/mcp`; OAuth credentials are stored in the operating-system credential store, not in `mcp.json` or this repository. Project-note guidance is scoped to `Ada Brain` only, with canonical pages under `Ada Brain → Projects → <group> → <project>`.

The repo-built `minimal-output` extension also runs by default. It compresses recognized Bash output from `tsc` / `typecheck`, lint commands, test runners, build tools, and package-manager installs/updates into short summaries before those results enter model context. Direct `vitest run` / `jest` commands, and `pnpm test` / `npm test` scripts that directly run Vitest or Jest, are rewritten to structured JSON reporter output plus a compact summary CLI when safe, so failures are surfaced from machine-readable reports instead of brittle terminal formatting. Vitest also gets `--silent=passed-only` unless already configured. Use `/minimal-output-savings` to inspect session savings. Commands and outputs it cannot confidently parse, or summaries that would not be smaller, pass through unchanged.

The repo-built `tool-pruner` extension intersects its default allowlist with Pi's current active-tool set, so it never re-enables tools excluded by CLI flags or a subagent such as read-only Luna. The normal callable set includes `read`, `bash`, `edit`, `write`, `usage_insights_report`, `subagent`, `subagent_status`, `web_search`, `fetch_content`, `get_search_content`, and `mcp`. Keep the packages installed but opt additional available tools back in per session with environment variables, for example:

```bash
PI_TOOL_PRUNER_EXTRA_ALLOW="code_search" pi
PI_TOOL_PRUNER_ALLOW="read,bash,edit,write,subagent,subagent_status" pi
PI_TOOL_PRUNER_DISABLED=true pi
```

## Health checks

Run:

```bash
pnpm pi:doctor
```

It verifies the config template, agent definitions, secret-free Notion MCP declaration, prompts, skills, and built extension entry points. It also reports whether a synced `settings.json` already exists in your Pi home.

For user agents, `pnpm pi:doctor` checks required metadata, exact Sol/Terra/Luna model routing, project-context inheritance, and disabled nested delegation. For skills, it checks that each `SKILL.md` starts with YAML frontmatter and includes the required `name` and `description` fields.
For third-party package defaults, it also checks that every `npm:` source is pinned to an exact version and that the curated versions in `config/pi/agent/package-policy.json` satisfy the 7-day minimum release age. It validates the final rendered settings after applying `config/pi/private/settings.overlay.json` when that private overlay exists.

## Private sync inputs

Use `config/pi/private/` for anything that should stay local to your workstation. Supported ignored files include:

- `settings.overlay.json`, deep-merged into the rendered Pi settings by `pnpm pi:sync`.
- `agent-context.json`, used to render optional AGENTS guidance such as the `<VAULT>` knowledge-capture line.

Use `config/pi/extensions.local/` for one-off local extension files or experiments that should not be tracked in git.
