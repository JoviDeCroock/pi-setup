# Personal Pi Home

This Pi home is optimized for software work inside the `pi-setup` monorepo and the projects it supports.

## Defaults

- Prefer explicit tools and visible context over invisible automation.
- Use `repo_context_snapshot` before broad repository scans when the task is exploratory.
- Use `review_gate_check` before merges or large refactors.
- Use `usage_insights_report` when you need to understand how a session is behaving over time.

## Extension development

- Keep Pi-specific assumptions behind adapter code or document them first.
- Treat `docs/pi-assumptions.md` as the source of truth for supported versus best-effort behavior.
- For extension changes, update tests and docs in the same pass.
