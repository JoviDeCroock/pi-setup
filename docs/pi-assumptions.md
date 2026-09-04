# Pi Assumptions

This repository deliberately separates documented Pi behavior from best-effort compatibility logic.

## Documented surfaces we rely on

These are explicitly described in the Pi docs:

- Extension modules export a default factory function that receives the Pi API.
- Extensions can register tools with `registerTool(...)`.
- Extensions can subscribe to lifecycle events with `pi.on(...)`.
- `tool_call` handlers can inspect and mutate built-in Bash tool input before execution.
- Blocked `tool_call` handlers can request early termination after the current tool batch.
- `abort()` can stop the active agent loop before a context handoff is queued.
- `tool_result` handlers can patch Bash tool result content and details before the result is saved into context.
- `appendEntry(...)` can persist custom session data.
- `sendMessage(...)` can append a model-visible custom message and trigger a follow-up turn.
- `getContextUsage()` reports estimated active-model context usage.
- `getAllTools(...)` and `setActiveTools(...)` can inspect and control active tools at runtime.
- Pi reads global and project-scoped settings files.
- Pi reads `AGENTS.md` context files.
- Pi discovers user subagent definitions through the installed `pi-subagents` package; the agent file format and locations are third-party extension behavior.

Pi does not provide native MCP support. This setup uses the third-party `pi-mcp-adapter` package and its documented `mcp.json`, proxy tool, and OAuth surfaces.

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
- `npm:pi-mcp-adapter`

The repo-built `tool-pruner` extension intersects its allowlist with Pi's existing active-tool boundary, including the MCP adapter's compact `mcp` proxy without re-enabling tools restricted by CLI or subagent configuration. The MCP adapter's `mcpScript` surface is disabled and its bundled scripting skill is filtered out; direct Notion tools are also disabled. Other active package tools can be selected through environment-configured allowlists when needed.

### Tracked MCP declaration

`config/pi/agent/mcp.json` follows `pi-mcp-adapter`'s documented Pi-global override format. It configures Notion's official hosted Streamable HTTP endpoint with OAuth and proxy-only tool discovery. A strict shared validator rejects extra servers, fields, commands, or credential-bearing configuration before doctor or sync can accept the file. OAuth credentials remain in the operating-system credential store; MCP caches and authorization state are machine-local.

This shape is based on the third-party extension READMEs, especially the documented `packages` filtering example in `tmustier/pi-extensions`, rather than on a Pi settings reference page we could verify directly. Keep those defaults explicit and easy to remove if Pi changes package resolution behavior. Git package defaults should include an explicit ref when practical so the rendered config is reproducible.

### Private sync inputs

`pnpm pi:sync` optionally reads `config/pi/private/settings.overlay.json` and deep-merges it into the rendered `settings.json`. It can also read `config/pi/private/agent-context.json` to render guarded optional blocks in `AGENTS.md`, such as replacing `<VAULT>` with a local knowledge-vault path. This is repo policy rather than Pi behavior; Pi only sees the final generated files. Keep secret or machine-local values in ignored private files instead of in `config/pi/agent/` templates.

### Bash result minimization

Pi documents that `tool_result` handlers can return partial patches to `content`, `details`, or `isError`. The repo's `minimal-output` extension uses that patch surface for Bash `tool_result` events: it parses recognized output from TypeScript, lint, test, build, and package-manager commands, and replaces only the LLM-visible text content with a compact summary when that is smaller. Original Bash metadata such as `fullOutputPath` is preserved in `details` when present.

`minimal-output` also uses Pi's documented Bash `tool_call` event mutation surface for direct `vitest run` / `jest` commands and package test scripts such as `pnpm test` or `npm test` when the nearest `package.json` script directly runs Vitest or Jest. It appends structured JSON reporter flags and a repo-built summary CLI so test failures are summarized from machine-readable reports rather than from fragile human-formatted output. Vitest commands also get `--silent=passed-only` unless the command already sets `--silent`, preserving failing-test logs while suppressing passing-test console noise. Commands with existing reporter/output-file flags, interactive watch modes, complex shell control operators, or scripts hidden behind another runner such as `turbo run test` are left unchanged. Each successful compaction appends a `minimal-output-savings` session entry; `/minimal-output-savings` reads those entries for a human-facing savings report without exposing an extra model-callable tool.

### Explicit context boundaries

`context-management` mirrors Codex's experimental token-budget handoff without pretending Pi exposes session replacement to model-callable tools. Pi documents `newSession()` only on user-invoked command contexts because calling it from tools or lifecycle handlers can deadlock. The extension atomically validates and persists the final `new_context.note`, blocks that tool call, aborts the active loop, and uses Pi's documented early-termination hint. After the agent settles, it injects one plaintext history-note message, triggers the next turn, and filters all earlier messages from subsequent provider context.

That boundary is deliberate: opaque provider reasoning state is not copied forward. It follows the defensive implication of _Stealing Reasoning Traces_ rather than serializing or replaying hidden reasoning blobs across a task boundary. Full history remains in Pi's local JSONL session for audit; only the model-visible context is reset. Because Pi's compaction and tree-summary paths independently read local history rather than the filtered provider context, model-authored compaction and tree summaries are cancelled after a context boundary; subsequent rollover is handled by another explicit `new_context` checkpoint instead.

Activation is conservative. The tools are available only in interactive TUI sessions using Pi's `openai-codex` subscription provider. API-key (`openai`), custom-provider, print, JSON, RPC, and headless temporary-worker sessions are excluded. Set `PI_CONTEXT_MANAGEMENT_EXPERIMENTAL_MODE=false` to disable the feature or `PI_CONTEXT_MANAGEMENT_REMINDER_TOKENS=<n>` to override the default 32,000-token reminder threshold.

## Contribution rule

If a new extension needs more Pi runtime surface area than this list covers:

1. add the wrapper in `packages/pi-kit/`
2. document the new assumption here
3. keep the extension package itself free of direct runtime guesswork
