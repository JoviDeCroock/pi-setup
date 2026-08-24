---
name: pr-stewardship
description: Safely finishes or updates an existing pull request through identity checks, semantic rebasing, focused verification, adversarial review, push safety, and CI follow-through. Use when asked to finish, rebase, fix, push, ship, or prepare a branch or PR for review.
---

# PR Stewardship

Treat a pull request as moving remote state, not just a local diff.

## Establish Identity and Authority

Before editing or pushing:

1. Read repository instructions and any attached task or PR instructions.
2. Confirm the repository, branch, base branch, PR number, PR state, head repository, and local/remote head SHA.
3. Read the PR body, review threads, checks, and complete branch diff.
4. Determine whether the request authorizes commits, pushes, force-pushes, PR-body edits, comments, or base retargeting. Do not infer permission to post comments.
5. Stop if the PR is merged or closed unless the user explicitly wants a follow-up branch or PR.

## Integrate the Current Base Semantically

1. Fetch the latest base and inspect incoming commits before rebasing.
2. Identify renamed modules, newer shared helpers, changed invariants, release-note conventions, and overlapping fixes.
3. Rebase or merge as repository policy requires.
4. Resolve conflicts by preserving current base semantics, not by mechanically choosing one side.
5. Search for stale duplicates, migrations, changesets, docs, and exports made obsolete by the new base.
6. Reinspect the complete post-rebase diff against the updated base.

Never run broad resets or destructive cleanup to make a rebase easier. A force-push requires explicit authorization and must use `--force-with-lease`.

## Finish the Change

1. Keep edits small and stage only owned paths in shared workspaces.
2. Search for an existing helper or contract before adding a new one.
3. Add or update direct regression coverage for behavior changes.
4. Run focused checks while iterating, then repository-prescribed checks when practical.
5. Establish whether failures reproduce on the base branch before labeling them regressions.
6. Invoke the `adversarial-review` skill for high-risk changes or when the user requests a final hostile review.
7. Update required docs, ADRs, issues, changesets, or release notes.

## Push and Observe

Immediately before pushing:

1. Fetch again.
2. Re-check PR state and remote divergence.
3. Confirm the commit set and staged/unstaged state.
4. Push using the least-destructive command authorized.
5. Verify local HEAD, remote branch HEAD, and PR head SHA match.
6. When asked to finish or babysit the PR, monitor required checks to a terminal state and report failures with links or concise evidence.

## PR Text Rules

- Keep the body concise and current.
- Never add `Validation` or `Verification` sections.
- Do not post issue or PR comments unless explicitly requested.
- Do not claim checks, screenshots, or environments that were not actually run.
- State intentional omissions in the handoff, not as fabricated proof in the PR body.

## Anti-Patterns

- Starting edits before confirming which PR owns the workspace.
- Rebasing textually without inspecting new base abstractions.
- Pushing after a long verification run without fetching again.
- Treating a pre-existing base failure as caused by the branch.
- Assuming a green unit suite proves browser, dev-mode, deployment, or integration behavior.

## Handoff

Report:

- PR and final SHA;
- semantic rebase decisions;
- changed behavior and important cleanup;
- checks and real-environment evidence;
- baseline failures or skipped checks;
- current review/CI state;
- remaining risks or follow-up work.
