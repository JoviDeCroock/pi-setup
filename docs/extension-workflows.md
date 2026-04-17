# Extension Workflows

## Daily loop

```bash
pnpm test
pnpm build
pnpm pi:doctor
```

For a full verification pass:

```bash
pnpm verify
```

## Adding a new extension package

1. Create a new package under `packages/extensions/<name>/`.
2. Keep the default export thin and route behavior into pure modules.
3. Reuse `@pi-setup/shared` for generic logic.
4. Reuse `@pi-setup/pi-kit` for Pi runtime integration.
5. Add tests beside the package.
6. Update:
   - `config/pi/agent/settings.template.json`
   - `examples/local-project/.pi/settings.json`
   - `README.md` and any relevant docs

## Current starter extensions

### Review Gate

Use `review_gate_check` when you want a disciplined summary of current changes before merge or handoff.

### Repo Context

Use `repo_context_snapshot` to gather a focused package/file map for an extension, feature, or bug.

### Usage Insights

Use `usage_insights_report` to summarize active-session usage or inspect a saved session JSONL file.

## Design rule

If the extension needs uncertain Pi behavior, add that compatibility shim to `packages/pi-kit/` first. Keep the package code itself clean, explicit, and easy to replace later.
