# pi-setup

`pi-setup` is a daily-driver pnpm + TypeScript monorepo for two jobs:

- personal Pi configuration you can sync into `~/.pi/agent`
- reusable Pi extensions you can develop, test, and iterate on in one place

The repo is optimized for maintainability and verification, not for a single demo flow. Pi-facing assumptions stay isolated behind a narrow adapter layer so extension work can continue even if Pi evolves.

## What you get

- A workspace-managed extension lab with shared utilities and a Pi compatibility layer
- Four repo-built extensions:
  - `repo-context` for repository mapping and targeted context snapshots
  - `usage-insights` for session telemetry and lightweight reporting
  - `rtk-rewrite` for optional RTK-backed Bash command rewrites
- Six curated third-party extensions in the generated global Pi config:
  - `pi-powerline-footer`
  - `@tmustier/pi-usage-extension`
  - `pi-subagents` for async subagent delegation
  - `pi-web-access` for web search and content extraction
  - `pi-memory-md` for git-backed markdown memory (requires user `repoUrl`)
  - `pi-autoresearch` for autonomous experiment loops (`/autoresearch` dashboard + tools)
- Optional RTK (Rust Token Killer) CLI support to prune command-output tokens before they reach the agent
- Personal Pi config templates, prompts, and skills under `config/pi/agent/`
- Example project-scoped `.pi/settings.json` wiring under `examples/local-project/`
- Scripts for syncing config and checking install health
- Unit tests, linting, formatting, and GitHub Actions CI

## Quick start

### Prerequisites

- Node.js **20.11+** (`node --version`)
- [pnpm](https://pnpm.io/installation) **10+** — `corepack enable && corepack prepare pnpm@10 --activate` is the easiest route
- Git, plus a working Pi install (`pi --version`); see [pi.dev](https://pi.dev/) if you haven't installed Pi yet
- Optional: [RTK](https://github.com/rtk-ai/rtk) for command-output token pruning (see the RTK section below)

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
- If you enabled `pi-memory-md`, set `pi-memory-md.repoUrl` in `~/.pi/agent/settings.json` and run `/memory-init` inside Pi.
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

### `repo-context`

Registers `repo_context_snapshot`, a tool that scores files and packages against a query, then returns a focused repository map with excerpts from the most relevant files.

### `usage-insights`

Registers `usage_insights_report`, plus a minimal `turn_end` hook that records compact session usage points with `appendEntry()`. Reporting works against the active session when possible and can also read exported JSONL session files.

### `rtk-rewrite`

Subscribes to Pi's `tool_call` event for the built-in Bash tool. When the standalone `rtk` binary is on `PATH`, it calls `rtk rewrite <command>` and mutates supported Bash commands before execution (for example, `git status` becomes `rtk git status`). If RTK is missing or cannot rewrite a command, the extension passes the original command through unchanged.

## Default external packages

The generated global `settings.json` also includes curated third-party package defaults from `config/pi/agent/package-policy.json`. Every `npm:` source is pinned to an exact version, and the repo only promotes npm releases once they are at least 7 days old.

The synced Pi config also sets `npmCommand` to `["pnpm"]`, so Pi runs package lookups and installs through `pnpm` rather than the default npm client. The package source syntax still stays `npm:...` because that is Pi's package source type, not a lock-in to the npm CLI binary.

- `npm:pi-powerline-footer` for the powerline-style footer and related UI affordances
- `npm:@tmustier/pi-usage-extension` for the `/usage` dashboard
- `npm:pi-subagents` for delegating work to specialized subagents with chains and async support
- `npm:pi-web-access` for `web_search`, `fetch_content`, and `get_search_content` tools
- `npm:pi-memory-md` for Letta-style git-backed markdown memory (ships disabled; set `pi-memory-md.repoUrl` and flip `enabled` to `true` to activate)
- `git:github.com/davebcn87/pi-autoresearch@56e9f2ec6f0dc6f9997126e4f1d8a4223de2a534` for autonomous optimization loops — `init_experiment`, `run_experiment`, `log_experiment` tools plus an `/autoresearch` dashboard

The local example project intentionally stays focused on the repo-built extensions so it remains self-contained.

## RTK (token pruning)

[RTK](https://github.com/rtk-ai/rtk) is a standalone Rust CLI proxy that filters and compresses command output (ls, cat, git, tests, lints, etc.) before it reaches the agent. RTK does not ship a Pi extension, so this repo includes `rtk-rewrite`, a small Pi extension that shells out to `rtk rewrite` for Bash tool calls.

Install the RTK binary once, rebuild/sync this repo, then re-run `pnpm pi:doctor` to confirm RTK is on `PATH`:

```bash
# macOS / Linux
brew install rtk
# or: cargo install --git https://github.com/rtk-ai/rtk

pnpm build
pnpm pi:sync
pnpm pi:doctor
```

No `rtk init` step is required for Pi's `rtk-rewrite` extension. Use `rtk init` only if you also want RTK's upstream hooks for other agents. See [docs/personal-setup.md](docs/personal-setup.md) for the full notes.

## Docs

- [Architecture](docs/architecture.md)
- [Pi Assumptions](docs/pi-assumptions.md)
- [Personal Setup](docs/personal-setup.md)
- [Extension Workflows](docs/extension-workflows.md)

## Design principles

- Pi-specific runtime assumptions are localized in `packages/pi-kit/`
- Extension packages keep their runtime entry points thin and their logic testable
- Tooling stays lightweight: pnpm, Turbo, TypeScript, `tsx`, `tsdown`, `oxlint`, and `oxfmt`
- Global setup and project-scoped setup both stay explicit and inspectable
