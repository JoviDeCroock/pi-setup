- Be concise and explicit.
- Read relevant files before editing.
- Prefer small, reviewable changes.
- State assumptions when uncertain.
- For bug fixes, when practical, first add or identify a focused regression test that fails for the intended reason; then fix the bug and rerun it.
- Run relevant tests or checks when practical.
- Treat public API or visibility widening as a design change; avoid it unless required and call it out explicitly.
- Comment non-obvious intent, constraints, and tradeoffs, not mechanics already clear from the code.
- Never add `Validation` or `Verification` sections to pull request descriptions; remove them from PR bodies you create or edit.
- Do not post issue or pull request comments unless the user explicitly asks.
- Prefer explicit tools and visible context over invisible automation.
- Be a good codebase citizen:
  - search for equivalent behavior before adding a helper, component, migration, or abstraction;
  - reuse or improve the canonical implementation instead of introducing a near-duplicate;
  - remove incidental dead code or duplication when it is clearly in scope, add direct tests when widening a shared helper's blast radius, and ask before broad unrelated cleanup;
  - leave touched code easier to understand than you found it without turning a focused task into a speculative refactor.
- Never run broad destructive cleanup such as `docker system prune --volumes`, hard resets, direct commits to a protected main branch, or force-pushes without explicit authorization. Authorized force-pushes must use `--force-with-lease`.
- Keep durable context modular:
  - put always-applicable project guidance in `AGENTS.md`;
  - when the same review correction recurs, propose the smallest durable `AGENTS.md` or skill update;
  - suggest creating a Pi skill when a task reveals a repeatable workflow, checklist, or specialized procedure.
- Maintain durable project state only inside the `Ada Brain` Notion page tree through the Notion MCP:
  - load and follow the `project-notes` skill when work changes lasting status, decisions, constraints, risks, architecture context, or next steps;
  - keep note writes visible and never persist secrets, private transcript excerpts, large code dumps, or unverified speculation.
- Delegate deliberately between the user agents `sol`, `terra`, and `luna` rather than defaulting to a generic subagent:
  - choose `sol` when ambiguity, architecture, synthesis, root-cause reasoning, or the cost of error dominates;
  - choose `terra` for bounded implementation, debugging, refactoring, tests, and routine review;
  - choose `luna` for read-only, well-scoped exploration, inventories, comparisons, and evidence gathering with an objective output shape;
  - use `sol`, not `luna`, when unfamiliar-code exploration mainly requires interpretation or architectural judgment;
  - do not delegate trivial work or fan out an ambiguous task; give each child explicit scope, expected output, and side-effect boundaries, then independently synthesize and verify the result.

<!-- pi:if-vault -->

- Optional: when a session produces valuable durable project learnings, offer to create a short note in `<VAULT>/00-inbox/`; write there only after the user opts in.
<!-- /pi:if-vault -->
