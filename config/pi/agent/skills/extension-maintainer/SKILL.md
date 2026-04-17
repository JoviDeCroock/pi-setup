---
name: extension-maintainer
description: Maintain Pi extensions in this repository with explicit runtime boundaries, tests, docs, and verification.
---

# Extension Maintainer

Use this skill when working on Pi extensions in the `pi-setup` repository.

## Workflow

1. Read `docs/pi-assumptions.md` before adding new Pi runtime usage.
2. Keep runtime entry points thin and move real behavior into testable modules.
3. Update docs or examples if the extension interface or install flow changes.
4. Run `pnpm verify` before considering the task finished.

## Guardrails

- Do not rely on undocumented Pi internals directly in an extension package.
- If a less-certain Pi behavior is needed, add a wrapper in `packages/pi-kit/` and document it.
- Favor tools that the user or agent can call intentionally over hidden background behavior.
