# pi-setup

`pi-setup` is a daily-driver pnpm + TypeScript monorepo for two jobs:

- personal Pi configuration you can sync into `~/.pi/agent`
- reusable Pi extensions you can develop, test, and iterate on in one place

The repo is optimized for maintainability and verification, not for a single demo flow. Pi-facing assumptions stay isolated behind a narrow adapter layer so extension work can continue even if Pi evolves.

## What you get

- A workspace-managed extension lab with shared utilities and a Pi compatibility layer
- Three starter extensions:
  - `review-gate` for change-risk and review-readiness checks
  - `repo-context` for repository mapping and targeted context snapshots
  - `usage-insights` for session telemetry and lightweight reporting
- Personal Pi config templates, prompts, and skills under `config/pi/agent/`
- Example project-scoped `.pi/settings.json` wiring under `examples/local-project/`
- Scripts for syncing config and checking install health
- Unit tests, linting, formatting, and GitHub Actions CI

## Quick start

```bash
pnpm install
pnpm build
pnpm pi:doctor
pnpm pi:sync
pnpm verify
```

`pnpm build` matters before syncing because the generated Pi settings reference built extension entry points in `dist/`.

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
- `pnpm verify` runs lint, format check, typecheck, tests, and build
- `pnpm pi:doctor` validates config files and built extension entry points
- `pnpm pi:sync` renders `config/pi/agent/settings.template.json` into a concrete Pi config and copies prompts and skills into your Pi home

## Starter extensions

### `review-gate`

Registers `review_gate_check`, a tool that inspects current git changes and returns a review-focused gate summary. It flags large diffs, missing tests, `debugger` statements, merge markers, and noisy debug leftovers.

### `repo-context`

Registers `repo_context_snapshot`, a tool that scores files and packages against a query, then returns a focused repository map with excerpts from the most relevant files.

### `usage-insights`

Registers `usage_insights_report`, plus a minimal `turn_end` hook that records compact session usage points with `appendEntry()`. Reporting works against the active session when possible and can also read exported JSONL session files.

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
