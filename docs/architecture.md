# Architecture

`pi-setup` is split into four layers:

## 1. Personal Pi config

`config/pi/agent/` holds the global Pi home content that gets synced into `~/.pi/agent`.

- `settings.template.json` is rendered with absolute workspace paths
- `AGENTS.md` holds global Pi guidance and guarded optional blocks rendered by `pi:sync`
- `agents/` defines the user-scoped Sol, Terra, and Luna delegation roles
- `mcp.json` declares a secret-free, proxy-only Notion MCP connection
- `prompts/` and `skills/` add reusable operator workflows

`pi:sync` treats prompts, skills, settings, AGENTS guidance, MCP configuration, and the three tracked agent definitions as repository-authoritative. It records the tracked agent filenames in a target-side manifest so later syncs replace or remove only repo-managed agents while preserving unrelated user agents created through `/agents`. OAuth credentials, auth files, trust state, caches, and sessions remain machine-local and are never copied from the repository.

## 2. Shared libraries

`packages/shared/` contains pure helpers for:

- filesystem traversal
- JSON and JSONL parsing
- text scoring and excerpting
- child process execution
- workspace discovery

These utilities stay Pi-agnostic so they can support scripts and extension code equally well.

## 3. Pi compatibility layer

`packages/pi-kit/` is the boundary between this repo and the Pi runtime.

- It models only the Pi surfaces this repo intentionally depends on
- It normalizes inconsistent tool execution signatures
- It keeps best-effort session-entry access isolated from business logic
- It exposes narrow guards for documented event payloads such as mutable Bash `tool_call` input and patchable Bash `tool_result` output
- It wraps active-tool inspection and pruning so prompt-shaping behavior stays explicit

When Pi behavior changes, this package is the first place to adapt.

## 4. Extension packages

`packages/extensions/*/` contains thin runtime entry points plus testable core logic.

- `usage-insights` records compact usage points and reports over them
- `minimal-output` compacts noisy Bash output from diagnostics, tests, builds, and package managers, using structured test reports for direct Vitest/Jest runs when safe
- `context-management` provides token-budget reminders and explicit plaintext context handoffs
- `tool-pruner` keeps the active callable tool set small before each agent turn

## Tooling

The repo uses:

- `pnpm` for workspace management
- `turbo` for package build and test orchestration
- `typescript` for strict typing
- `tsdown` for bundling extension packages
- `tsx` for scripts and tests
- `oxlint` and `oxfmt` for static verification

The result is a monorepo that can be used daily without hiding critical behavior behind opaque generators.
