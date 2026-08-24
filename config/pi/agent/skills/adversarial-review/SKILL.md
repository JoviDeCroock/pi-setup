---
name: adversarial-review
description: Challenges implementation claims with hostile inputs, composition paths, lifecycle timing, platform semantics, and regression tests. Use when asked for an adversarial review, second pass, pre-merge challenge, or deep correctness audit of a risky change.
---

# Adversarial Review

Try to disprove the change's important claims before approving them.

## Scope

1. Read the request, repository instructions, complete diff, affected contracts, and existing tests.
2. State the behavioral claims the change depends on.
3. Rank them by cost of being wrong and focus on the highest-risk claims first.
4. Review independently from the implementation narrative; code and observed behavior outrank the PR description.

## Challenge the Change

For each important claim, inspect relevant failure classes:

- hostile, malformed, empty, oversized, or adversarial inputs;
- trust-boundary and authorization mistakes;
- composition with caching, retries, streams, adapters, middleware, and concurrent calls;
- lifecycle timing, cleanup, reload, cancellation, stale state, and partial failure;
- native browser, URL, filesystem, network, or framework semantics hidden by local abstractions;
- dev versus production behavior and built versus source artifacts;
- missing bounds, unsafe defaults, and fail-open behavior;
- duplicated logic that can drift from the canonical helper.

Use the smallest throwaway probe or fixture that can settle uncertainty. Remove temporary probes before handing off.

## Findings

A finding must include:

- impact and realistic trigger;
- exact path/symbol or behavioral boundary;
- evidence from code, a focused reproduction, or an authoritative contract;
- the smallest appropriate fix or test;
- confidence and any unresolved assumption.

Do not inflate stylistic preferences into correctness findings. Separate pre-existing failures from regressions.

## When Fixing Is Authorized

1. Reproduce or prove the issue before editing.
2. Fix the root cause, preferably at the shared boundary.
3. Add a regression test that fails before the fix and passes after it.
4. Re-run the focused reproduction and relevant prescribed checks.
5. Re-review the final diff for accidental scope growth.

## Verification

- Every high-severity claim was challenged with evidence.
- Temporary probes and debug artifacts were removed.
- Findings distinguish observed facts from hypotheses.
- The conclusion names what was not tested, including browser, dev-mode, deployment, or integration paths.
