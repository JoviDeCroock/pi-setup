# Session Learnings: 2026-08-20 through 2026-08-23

This review sampled recent local Codex and Claude Code histories to identify repeatable operating improvements. Transcript details were summarized rather than copied, and no secrets or project source were added to this repository.

## Scope

- 254 executable Codex sessions from 287 session files
- 62 primary Claude Code sessions, excluding child-agent transcripts except where parent orchestration required context
- Four calendar days: 2026-08-20 through 2026-08-23

Counts overlap because one session can include rebasing, review, verification, and release work.

## Repeated Patterns

### Pull requests are moving remote state

The dominant workflow was finishing, rebasing, fixing, and pushing parallel pull requests. Repeated failures came from stale PR identity, a moving base branch, and PRs merging while another workspace was still active.

The durable response is the `pr-stewardship` skill: confirm repository/PR/head identity, integrate the base semantically, fetch again before pushing, use lease-protected force pushes only when authorized, and verify local, remote, and PR head parity.

### Green local checks do not replace real use

Browser, dev-mode, built-artifact, deployment, and integration testing found issues that static review and unit suites missed. Visual work also required responsive, theme, console, network, and stale-cache checks.

The durable response is the `web-dogfood` skill, composed with `agent-browser`, plus explicit handoff language for environments that were not exercised.

### Adversarial review finds composition failures

Independent challenge passes repeatedly found failures involving cache expiry, stream metadata, native browser behavior, lifecycle timing, and missing regression coverage.

The durable response is the `adversarial-review` skill. It requires evidence-backed findings and distinguishes regressions from baseline failures.

### Shared helpers and current boundaries matter during rebases

Several sessions asked agents to consolidate duplicate helpers, migrations, changesets, constants, or page-level components. The strongest rebases inspected incoming base commits and adopted newer shared abstractions instead of resolving conflicts textually.

This is always-applicable behavior, so it lives in the managed global `AGENTS.md` rather than another skill.

### Broad destructive cleanup needs an explicit gate

One child agent deleted unused local Docker volumes during a product test. Other risky recurring operations included hard resets, force pushes, and shared-worktree staging.

The managed global prompt now requires explicit authorization for broad destructive cleanup and lease protection for authorized force pushes.

### Delegation should match the shape of the task

Claude sessions used purpose-specific Explore agents effectively for read-only maps, while large generic implementation fan-outs required substantial reconciliation and created safety risk. Codex parallelism mainly came from separate top-level workspaces rather than child agents.

The global setup now defines three deliberate user agents:

- `sol` for ambiguous, cross-cutting, architecture-heavy, or high-risk reasoning;
- `terra` for bounded implementation, debugging, refactoring, and tests;
- `luna` for read-only, well-scoped exploration and evidence collection.

The global prompt requires explicit scopes, output shapes, and side-effect boundaries, followed by independent synthesis and verification.

## Additional Requested Workflow

Project status, decisions, constraints, risks, and next steps should survive local sessions. The setup therefore adds a proxy-only connection to Notion's hosted MCP server and a `project-notes` skill that writes only within `Ada Brain`, using `Ada Brain → Projects → <group> → <project>` instead of producing per-session logs.

OAuth credentials remain in the operating-system credential store and are never synced or committed.
