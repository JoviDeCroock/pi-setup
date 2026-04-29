# Pi Assumptions

This repository deliberately separates documented Pi behavior from best-effort compatibility logic.

## Documented surfaces we rely on

These are explicitly described in the Pi docs:

- Extension modules export a default factory function that receives the Pi API.
- Extensions can register tools with `registerTool(...)`.
- Extensions can subscribe to lifecycle events with `pi.on(...)`.
- `tool_call` handlers can inspect and mutate built-in Bash tool input before execution.
- `tool_result` handlers can patch Bash tool result content and details before the result is saved into context.
- `appendEntry(...)` can persist custom session data.
- `getAllTools(...)` and `setActiveTools(...)` can inspect and control active tools at runtime.
- Pi reads global and project-scoped settings files.
- Pi reads `AGENTS.md` context files.

Official docs:

- Package overview: <https://pt-act-pi-mono.mintlify.app/packages/coding-agent>
- Extension system: <https://pt-act-pi-mono.mintlify.app/concepts/extensions>

## Best-effort assumptions isolated in `packages/pi-kit/`

Some Pi details are not stable enough to spread around the codebase, so they are wrapped:

### Tool execute argument order

The public docs and examples show different tool `execute(...)` argument orders. `packages/pi-kit/src/tool-runtime.ts` normalizes the runtime arguments and lets extensions consume a stable shape.

### Session entry access

The docs show persisted custom entries and examples that read them back, but the exact session manager surface is not formalized in the overview docs. `usage-insights` uses a tolerant `getEntries()` adapter and falls back to in-memory points when that surface is unavailable.

### JSONL session parsing

Exported session files are treated as best-effort structured logs. `usage-insights` only reads the fields it owns or fields that can be safely ignored when missing.

### Package-based default extensions in settings

The generated `config/pi/agent/settings.template.json` uses a `packages` stanza for third-party defaults. Those defaults are sourced from `config/pi/agent/package-policy.json`, not hand-written inline in the template.

The same template also sets `npmCommand` to `["pnpm"]`, which means Pi routes npm-style package lookup/install operations through `pnpm`. This follows the documented Pi `npmCommand` setting for alternate package-manager commands; the package source type still remains `npm:`.

Repo policy for third-party defaults:

- `npm:` package sources must use exact version pins such as `npm:pkg@1.2.3`
- promoted npm versions must be at least 7 days old before they land in the synced config
- `pnpm pi:doctor` and `pnpm pi:sync` enforce that policy against the checked-in defaults

The current curated package names remain:

- `npm:pi-powerline-footer`
- `npm:@tmustier/pi-usage-extension`
- `npm:pi-subagents`
- `npm:pi-web-access`

The repo-built `tool-pruner` extension keeps only selected callable tools from those packages active by default; the packages remain installed so other tools can be re-enabled through environment-configured allowlists when needed.

This shape is based on the third-party extension READMEs, especially the documented `packages` filtering example in `tmustier/pi-extensions`, rather than on a Pi settings reference page we could verify directly. Keep those defaults explicit and easy to remove if Pi changes package resolution behavior. Git package defaults should include an explicit ref when practical so the rendered config is reproducible.

### Private sync inputs

`pnpm pi:sync` optionally reads `config/pi/private/settings.overlay.json` and deep-merges it into the rendered `settings.json`. It can also read `config/pi/private/agent-context.json` to render guarded optional blocks in `AGENTS.md`, such as replacing `<VAULT>` with a local knowledge-vault path. This is repo policy rather than Pi behavior; Pi only sees the final generated files. Keep secret or machine-local values in ignored private files instead of in `config/pi/agent/` templates.

### Bash result minimization

Pi documents that `tool_result` handlers can return partial patches to `content`, `details`, or `isError`. The repo's `minimal-output` extension uses only that documented patch surface: it listens for Bash `tool_result` events, parses recognized diagnostics (`tsc`, `eslint`, `oxlint`, `biome lint`, and package-manager `lint` / `typecheck` scripts), and replaces only the LLM-visible text content with a compact summary. Original Bash metadata such as `fullOutputPath` is preserved in `details` when present.

### RTK (Rust Token Killer) CLI

[RTK](https://github.com/rtk-ai/rtk) itself is not a Pi extension — it's a standalone Rust binary that rewrites common commands (`ls`, `cat`, `git`, test runners, linters) into token-compressed variants. This repo's `rtk-rewrite` extension bridges Pi to that binary by listening for documented Bash `tool_call` events, calling `rtk rewrite <command>`, and mutating the Bash command when RTK returns a supported rewrite. If `rtk` is missing or cannot rewrite a command, the original command is left unchanged. `pnpm pi:doctor` reports whether `rtk` is on PATH so it stays visible without being a hard requirement.

## Contribution rule

If a new extension needs more Pi runtime surface area than this list covers:

1. add the wrapper in `packages/pi-kit/`
2. document the new assumption here
3. keep the extension package itself free of direct runtime guesswork
