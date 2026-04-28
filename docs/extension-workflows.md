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
   - `README.md` and any relevant docs

## Updating default npm packages

The repo-managed third-party package defaults live in `config/pi/agent/package-policy.json`.

When you update one:

1. Pin an exact `npm:` version.
2. Record the publish timestamp from `npm view <pkg> version time --json`.
3. Keep the version at least 7 days old before promoting it.
4. Pin `git:` package sources to a tag or commit ref when practical.
5. Run `pnpm pi:doctor` and `pnpm verify`.

## Current starter extensions

### Review Gate

Use `review_gate_check` when you want a disciplined summary of current changes before merge or handoff. Its default `all` scope checks staged, unstaged, and untracked files; pass `staged`, `working-tree`, or `last-commit` for narrower review slices.

### Repo Context

Use `repo_context_snapshot` to gather a focused package/file map for an extension, feature, or bug. Results include line-numbered excerpts. File discovery is Git-aware when possible (`git ls-files --cached --others --exclude-standard`) so ignored/generated files stay out of the snapshot, with a bounded filesystem fallback for non-Git workspaces. Pass `includeExtensions` when a project uses additional text-like file suffixes.

### Usage Insights

Use `usage_insights_report` to summarize active-session usage or inspect a saved session JSONL file.

### RTK Rewrite

`rtk-rewrite` listens for Pi Bash tool calls and, when the standalone `rtk` binary is on `PATH`, rewrites supported commands through `rtk rewrite` before execution. It is intentionally pass-through when RTK is missing or a command has no RTK equivalent.

### Tool Pruner

`tool-pruner` uses Pi's active-tool API to keep heavy third-party tool schemas out of the prompt by default. Configure it with `PI_TOOL_PRUNER_ALLOW`, `PI_TOOL_PRUNER_EXTRA_ALLOW`, `PI_TOOL_PRUNER_DENY`, or `PI_TOOL_PRUNER_DISABLED` when a session needs a different callable tool set.

## Design rule

If the extension needs uncertain Pi behavior, add that compatibility shim to `packages/pi-kit/` first. Keep the package code itself clean, explicit, and easy to replace later.
