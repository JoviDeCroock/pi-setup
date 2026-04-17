# Pi Assumptions

This repository deliberately separates documented Pi behavior from best-effort compatibility logic.

## Documented surfaces we rely on

These are explicitly described in the Pi docs:

- Extension modules export a default factory function that receives the Pi API.
- Extensions can register tools with `registerTool(...)`.
- Extensions can subscribe to lifecycle events with `pi.on(...)`.
- `appendEntry(...)` can persist custom session data.
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

## Contribution rule

If a new extension needs more Pi runtime surface area than this list covers:

1. add the wrapper in `packages/pi-kit/`
2. document the new assumption here
3. keep the extension package itself free of direct runtime guesswork
