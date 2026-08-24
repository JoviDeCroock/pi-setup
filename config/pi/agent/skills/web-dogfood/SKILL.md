---
name: web-dogfood
description: Routes web QA and visual-polish work through agent-browser's version-matched dogfood workflow with local evidence and handoff requirements. Use for web dogfooding, visual QA, browser regression checks, or requests to ensure a UI looks and feels correct.
---

# Web Dogfood

Use `agent-browser`; do not invent a parallel browser workflow.

## Load the Canonical Workflow

Before browser actions, run:

```bash
agent-browser skills get core
agent-browser skills get dogfood
```

Follow those version-matched instructions for mechanics, exploration, evidence capture, and reporting.

## Local Policy

- Confirm the correct app, route, fixture, account, base URL, commit, and whether fixes are authorized.
- Use a production-like built artifact when release behavior matters; test dev mode separately when it is in scope.
- Clear or bypass stale caches when they could mask current code.
- Include the smallest relevant matrix across desktop/mobile, light/dark, reduced motion, keyboard focus, loading/error/empty states, console failures, and network or asset errors.
- Distinguish product defects from preview-server, cache, seed-data, or environment failures.
- Search for the existing shared page-level component or helper before adding a visual near-duplicate.
- Re-run the exact browser flow after each authorized fix and capture before/after evidence for visual changes.
- Explicitly name any untested environment or missing screenshot; never infer browser correctness from static review or a green unit suite.
