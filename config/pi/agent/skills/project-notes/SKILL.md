---
name: project-notes
description: Maintains canonical project notes in Notion through the Notion MCP. Use when work reveals durable project status, decisions, constraints, risks, architecture context, or next steps that should survive the current repository or session.
---

# Project Notes

Keep durable project state discoverable inside `Ada Brain` without turning Notion into a transcript archive. `Ada Brain` is the only authorized Notion destination for this skill.

## When to Use

- A decision, constraint, risk, or architectural invariant will matter in later sessions.
- Project status or next steps materially changed.
- The user asks to record, retrieve, or update project context.
- A handoff would otherwise depend on ephemeral chat history.

Do not use this for temporary implementation details already clear from code, tests, an issue, or a PR.

## Procedure

1. Use the `mcp` proxy to search the `notion` server within `Ada Brain` before creating anything. Do not read or write pages outside that page tree for project-note work.
2. Resolve identity from repository remotes, package names, and existing project terminology. Use `Ada Brain → Projects → <group> → <project>`; existing grouping pages use lowercase organization or repository families such as `preact`, `resynapse`, and `shopify`.
3. If several project pages or grouping pages are plausible, ask the user which one is canonical.
4. Read the relevant project-page sections before editing so the update preserves current context and does not duplicate an existing note.
5. Update the canonical page in place. Prefer concise sections such as:
   - current status;
   - durable decisions and rationale;
   - constraints and invariants;
   - risks or open questions;
   - next steps;
   - links to authoritative issues, PRs, ADRs, or docs.
6. Add dates only where chronology matters. Replace stale status instead of appending a new session log.
7. Tell the user which `Ada Brain` page and sections changed.

## Write Boundaries

- The standing project-notes request authorizes routine updates to an established canonical project page when durable state changes.
- Ask before creating the first project page, choosing between ambiguous groups, or restructuring a page substantially. When creation is approved, follow `Ada Brain → System → Template — Project`.
- Never write project notes outside `Ada Brain`, even if the Notion account exposes other workspaces or page trees.
- Use `Ada Brain → Sources` only for immutable evidence and `Ada Brain → Inbox` only for material that cannot yet be routed.
- Never persist credentials, tokens, private transcript excerpts, large code dumps, customer data, or unverified speculation.
- Keep code, tests, ADRs, issues, and PRs authoritative for implementation details; link to them rather than copying them.
- If Notion MCP is unavailable or unauthenticated, report the pending note content briefly and continue the primary task. Do not silently substitute another store.

## MCP Workflow

Use proxy discovery to avoid loading every Notion tool into context:

1. `mcp` search scoped to server `notion`.
2. Describe the selected read/search tool before calling it.
3. Search and read the canonical page.
4. Describe and call the narrowest update tool.
5. Read back the changed section when practical.

## Anti-Patterns

- One page per session.
- Repeating the PR body or changelog in Notion.
- Recording guesses as settled decisions.
- Creating a new project page because search terms were too narrow.
- Letting note maintenance block a requested code change when MCP is unavailable.

## Verification

- Confirm the destination is inside `Ada Brain → Projects` and the canonical page was reused or creation was approved.
- Confirm stale content was updated rather than duplicated.
- Confirm no sensitive or transcript-only material was persisted.
- Report the destination and concise change summary.
