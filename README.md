# pi-setup

`pi-setup` is a daily-driver pnpm + TypeScript monorepo for two jobs:

- personal Pi configuration you can sync into `~/.pi/agent`
- reusable Pi extensions you can develop, test, and iterate on in one place

The repo is optimized for maintainability and verification, not for a single demo flow. Pi-facing assumptions stay isolated behind a narrow adapter layer so extension work can continue even if Pi evolves.

## What you get

- A workspace-managed extension lab with shared utilities and a Pi compatibility layer
- Four repo-built extensions:
  - `usage-insights` for session telemetry and lightweight reporting
  - `minimal-output` for compacting noisy `tsc`, lint, test, build, and package-manager Bash output before it enters model context
  - `context-management` for explicit plaintext handoffs before context exhaustion
  - `tool-pruner` for keeping only the most useful third-party callable tools in the prompt by default
- Five curated third-party extensions in the generated global Pi config:
  - `pi-powerline-footer`
  - `@tmustier/pi-usage-extension`
  - `pi-subagents` for async subagent delegation
  - `pi-web-access` for web search and content extraction
  - `pi-mcp-adapter` for proxy-only access to Notion's hosted MCP server
- Built-in Bash output minimization for common diagnostics, tests, builds, and package-manager logs
- Personal Pi config templates, prompts, and skills under `config/pi/agent/`
  - optional `<VAULT>` rendering from ignored `config/pi/private/agent-context.json` for personal knowledge-capture guidance
  - `agent-browser` for browser, web app, Electron, and Slack automation via the `agent-browser` CLI
  - `agent-device` for mobile, TV, and desktop device automation via the `agent-device` CLI, with companion `dogfood` and `react-devtools` skills
  - `extension-maintainer` for this repository's extension workflow
  - `session-lessons` for inspecting Pi session history and turning repeated assistant mistakes into corrective skills or context updates
  - `project-notes` for maintaining canonical Notion project pages
  - `pr-stewardship` and `adversarial-review` for safe PR completion and evidence-backed challenge passes
  - `web-dogfood` for responsive, theme, console, network, and visual browser QA
- Deliberate user agents under `config/pi/agent/agents/`: Sol for deep judgment, Terra for bounded implementation, and Luna for read-only exploration
- Example project-scoped `.pi/settings.json` wiring under `examples/local-project/`
- Scripts for syncing config and checking install health
- Unit tests, linting, formatting, and GitHub Actions CI

## Quick start

### Prerequisites

- Node.js **20.11+** (`node --version`)
- [pnpm](https://pnpm.io/installation) **10+** — `corepack enable && corepack prepare pnpm@10 --activate` is the easiest route
- Git, plus a working Pi install (`pi --version`); see [pi.dev](https://pi.dev/) if you haven't installed Pi yet

### Clone and bootstrap

```bash
# 1. Clone the repo
git clone git@github.com:JoviDeCroock/pi-setup.git
cd pi-setup

# 2. Install workspace dependencies
pnpm install

# 3. Build every workspace package (required before sync — settings reference dist/ entry points)
pnpm build

# 4. Sanity-check the config, prompts, skills, and built extensions
pnpm pi:doctor

# 5. Render config/pi/agent/settings.template.json into ~/.pi/agent and copy prompts + skills
pnpm pi:sync
```

> **Tip:** Use `pnpm pi:sync -- --dry-run` first to see what the sync will do without writing, or `pnpm pi:sync -- --target /tmp/pi-agent` to render into a scratch directory. Sync refuses to write settings with missing built extension entry points unless you pass `--allow-missing-extensions`. See [docs/personal-setup.md](docs/personal-setup.md).

### After the first sync

- Restart any running Pi session (or run `/reload`) so the new extensions load.
- Re-run `pnpm pi:sync` whenever you change anything under [config/pi/agent/](config/pi/agent/) or rebuild an extension.

## Repository layout

```text
config/pi/agent/           Personal Pi config, prompts, skills, and settings template
docs/                      Architecture, assumptions, and workflows
examples/local-project/    Example project-scoped Pi setup
packages/shared/           Pure filesystem, text, and process utilities
packages/pi-kit/           Pi runtime compatibility layer and helpers
packages/extensions/       Starter Pi extension packages
scripts/                   Repo automation for sync and diagnostics
```

## Core commands

- `pnpm build` builds all workspace packages through Turbo
- `pnpm test` runs package test suites
- `pnpm typecheck` runs a single repo-wide TypeScript check
- `pnpm verify` runs lint, format check, typecheck, tests, build, and `pi:doctor`
- `pnpm pi:doctor` validates config files and built extension entry points
- `pnpm pi:sync` renders `config/pi/agent/settings.template.json` into a concrete Pi config and copies prompts and skills into your Pi home

## Starter extensions

### `usage-insights`

Registers `usage_insights_report`, plus a minimal `turn_end` hook that records compact session usage points with `appendEntry()`. Reporting works against the active session when possible and can also read exported JSONL session files.

### `minimal-output`

Subscribes to Pi's Bash tool events and replaces recognized noisy output with compact summaries before it enters model context. It recognizes TypeScript compiler output (`tsc`, `vue-tsc`, `typecheck`), lint output (`eslint`, `oxlint`, `biome lint`, `lint`), common test runners (`vitest`, `jest`, `node --test`, `pytest`, etc.), build tools (`vite build`, `next build`, `webpack`, `rollup`, `tsup`, etc.), and package-manager commands (`pnpm install`, `npm install`, `yarn add`, etc.). For direct `vitest run` / `jest` commands, and `pnpm test` / `npm test` scripts that directly run Vitest or Jest, it first rewrites the Bash command to use structured JSON reporter output plus a tiny summary CLI; Vitest also gets `--silent=passed-only` unless the command already sets `--silent`. Savings are recorded as session entries and visible with `/minimal-output-savings`. Unrecognized commands and output it cannot parse pass through unchanged.

Example minimized output:

```text
tsc: 2 errors
- src/index.ts:12:34 error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.
- src/app.ts:4:7 error TS2322: Type 'string' is not assignable to type 'number'.
```

### `tool-pruner`

Uses Pi's documented active-tool API to keep the callable tool list small before each agent turn. By default it keeps `read`, `bash`, `edit`, `write`, `history_note`, `new_context`, `usage_insights_report`, `subagent`, `subagent_status`, `web_search`, `fetch_content`, and `get_search_content`. Override with environment variables:

- `PI_TOOL_PRUNER_ALLOW="read,bash,edit,write,web_search"` to replace the default allowlist
- `PI_TOOL_PRUNER_EXTRA_ALLOW="code_search,subagent_status"` to add to the default allowlist
- `PI_TOOL_PRUNER_DENY="usage_insights_report"` to remove entries from the final allowlist
- `PI_TOOL_PRUNER_DISABLED=true` to opt out for a session

### `context-management`

Adds a token-budget reminder plus `history_note` and `new_context` tools for the main interactive `openai-codex` session. `history_note` can record incremental checkpoints; `new_context` atomically persists its final `note` argument and starts a follow-up turn whose provider context begins at that checkpoint. Earlier assistant messages—including opaque reasoning state—remain in the local session log but are not sent across the boundary. Pi compaction and tree summarization are blocked after a boundary so their independent summarizers cannot re-import pre-boundary reasoning.

The extension intentionally stays off for API-key and custom providers and for headless/structured worker sessions. Disable it with `PI_CONTEXT_MANAGEMENT_EXPERIMENTAL_MODE=false`, or change the default 32,000-token reminder threshold with `PI_CONTEXT_MANAGEMENT_REMINDER_TOKENS=<n>`.

## Default external packages

The generated global `settings.json` also includes curated third-party package defaults from `config/pi/agent/package-policy.json`. Every `npm:` source is pinned to an exact version, and the repo only promotes npm releases once they are at least 7 days old.

The synced Pi config defaults the main orchestrator session to `openai-codex/gpt-5.6-sol` with high thinking, and subagents without their own model override to `openai-codex/gpt-5.6-terra`. Named `sol`, `terra`, and `luna` definitions make task-based selection explicit. It also sets `npmCommand` to `["pnpm"]`, so Pi runs package lookups and installs through `pnpm` rather than the default npm client. The package source syntax still stays `npm:...` because that is Pi's package source type, not a lock-in to the npm CLI binary.

- `npm:pi-powerline-footer` for the powerline-style footer and related UI affordances
- `npm:@tmustier/pi-usage-extension` for the `/usage` dashboard
- `npm:pi-subagents` for delegating work to specialized subagents with chains and async support
- `npm:pi-web-access` for `web_search`, `code_search`, `fetch_content`, and `get_search_content` tools
- `npm:pi-mcp-adapter` for the compact `mcp` proxy and OAuth connection to Notion

`tool-pruner` keeps only the commonly useful third-party tools active by default: `subagent`, `subagent_status`, `web_search`, `fetch_content`, `get_search_content`, and `mcp`, while preserving stricter runtime boundaries such as Luna's read-only tool set. Less frequently needed tools such as `code_search` stay installed but out of the model prompt until you opt them back in with `PI_TOOL_PRUNER_ALLOW` or `PI_TOOL_PRUNER_EXTRA_ALLOW`. The MCP scripting tool and bundled scripting skill are disabled because this setup intentionally uses the smaller proxy workflow.

## Docs

- [Architecture](docs/architecture.md)
- [Pi Assumptions](docs/pi-assumptions.md)
- [Personal Setup](docs/personal-setup.md)
- [Extension Workflows](docs/extension-workflows.md)
- [Session Learnings: August 2026](docs/session-learnings-2026-08.md)

## Design principles

- Pi-specific runtime assumptions are localized in `packages/pi-kit/`
- Extension packages keep their runtime entry points thin and their logic testable
- Tooling stays lightweight: pnpm, Turbo, TypeScript, `tsx`, `tsdown`, `oxlint`, and `oxfmt`
- Global setup and project-scoped setup both stay explicit and inspectable
