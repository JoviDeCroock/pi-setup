# Pi Setup Workspace

Treat this repository as both a personal Pi home directory and a reusable extension lab.

## Guardrails

- Keep Pi-specific assumptions behind `@pi-setup/pi-kit` or clearly documented adapter code.
- Prefer documented extension surfaces: tool registration, explicit commands, and narrow lifecycle hooks.
- When you change extension behavior, update tests and the relevant docs in `docs/`.
- Run `pnpm verify` before considering work complete.

## Layout

- `config/pi/agent/` contains the personal Pi config that gets synced into `~/.pi/agent`.
- `packages/pi-kit/` is the compatibility layer for Pi runtime assumptions.
- `packages/extensions/*/` are the starter Pi extensions.
- `packages/shared/` contains pure filesystem, text, and process helpers.
- `examples/local-project/` shows project-scoped Pi wiring.

## Working Style

- Keep extension logic pure and testable; thin runtime entry points should delegate into pure functions.
- If a new extension needs a less-certain Pi API surface, document it in `docs/pi-assumptions.md` before using it widely.
- Favor small, composable tools over broad automatic behavior that silently mutates model context.
