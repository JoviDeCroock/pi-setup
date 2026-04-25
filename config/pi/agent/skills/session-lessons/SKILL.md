---
name: session-lessons
description: Inspect Pi session history, analyze repeated assistant mistakes, and turn durable learnings into corrective skills or context updates. Use when the user asks to review previous sessions, learn from a failed interaction, or stop the model repeating a mistake.
---

# Session Lessons

Use this skill to convert evidence from one or more Pi sessions into future-facing guidance. The default outcome is a short retrospective plus a proposed durable fix. Create or update a skill only when the finding is repeatable, actionable, and better captured as a workflow/checklist than as one-off project memory.

## Safety and Scope

- Session transcripts may contain credentials, proprietary code, or private user text. Redact secrets before quoting, and avoid copying large transcript chunks into durable files.
- Ask before writing durable changes unless the user explicitly requested implementation.
- Prefer the narrowest durable surface:
  1. Existing skill update for domain-specific repeated mistakes.
  2. New skill for a recurring workflow or anti-pattern with clear triggers.
  3. Project `AGENTS.md` for always-applicable project conventions.
  4. A project doc or issue for one-off findings.
- Do not create a skill for vague advice, model preferences, or isolated failures.
- If the mistake came from missing tooling rather than missing instructions, recommend tooling or an extension instead of a skill.

## Session Discovery

Pi stores sessions as JSONL under `~/.pi/agent/sessions/`. Use the helper script to avoid loading entire transcripts too early:

```bash
node scripts/session-lessons.mjs list --cwd "$PWD" --limit 10
node scripts/session-lessons.mjs list --all --limit 20
node scripts/session-lessons.mjs extract <session-jsonl-path> --max-entries 200 --max-entry-chars 1200
```

Resolve `scripts/session-lessons.mjs` relative to this skill directory.

If the user knows the current session ID or file path, use that directly. Otherwise list recent sessions for the current working directory first. For cross-project patterns, use `--all` and ask the user which sessions are relevant before extracting transcripts.

## Workflow

### 1. Establish the Learning Target

Clarify the user’s concern in one sentence:

- What mistake repeated?
- Was it in this session, earlier sessions, or a known class of tasks?
- What should the assistant do differently next time?

If the user says “you keep doing X” or “learn from this,” treat the current conversation as primary evidence and ask whether to inspect stored sessions as supporting evidence.

### 2. Collect Evidence

Use progressively larger context:

1. List candidate sessions.
2. Extract only the relevant session(s).
3. Summarize evidence before reading or quoting more.
4. Pull exact snippets only when needed to prove the pattern.

For each session, capture:

- Session file, ID/name, date, and cwd.
- User goal.
- Assistant mistake or failed approach.
- Correction or eventual successful behavior.
- Any tool errors, missed instructions, or ignored project context.

### 3. Diagnose the Root Cause

Classify the cause before proposing a fix:

- **Missing trigger**: the model did not know when to use a workflow.
- **Missing procedure**: the model lacked a checklist or sequence.
- **Ignored constraint**: existing instructions were present but too weak or buried.
- **Bad tool habit**: the model used the wrong tool or command repeatedly.
- **Knowledge gap**: the model needed domain-specific references.
- **Ambiguous user intent**: the model should have asked a clarifying question.

### 4. Choose the Durable Fix

Create or update a skill only if all are true:

- The problem is likely to recur.
- A future trigger can be described in the skill `description`.
- The fix is procedural or checklist-like.
- The skill can include concrete “do/don’t” guidance and verification steps.

Otherwise propose an `AGENTS.md`, docs, test, prompt template, or tooling change.

### 5. Draft the Corrective Skill

When a new skill is warranted, draft it with:

- A short lowercase hyphenated name matching its directory.
- A precise description that states when to use it.
- A “When to Use” section with concrete trigger phrases or task shapes.
- A “Procedure” section that prevents the observed mistake.
- “Anti-Patterns” listing the repeated bad behavior.
- “Verification” steps to prove the mistake was avoided.
- Minimal evidence notes that reference session IDs or dates without embedding sensitive transcript content.

Use this skeleton:

```markdown
---
name: corrective-skill-name
description: Prevents <specific recurring mistake>. Use when <clear future trigger>.
---

# Corrective Skill Name

## When to Use

- ...

## Procedure

1. ...

## Anti-Patterns

- Do not ...

## Verification

- Confirm ...

## Evidence

- Derived from session <id/date>; details intentionally summarized.
```

### 6. Apply Carefully

- For this managed Pi setup repository, add global skills under `config/pi/agent/skills/<name>/SKILL.md` and run `pnpm pi:doctor` after editing.
- For another project, prefer project-local `.pi/skills/<name>/SKILL.md` unless the user wants a global skill.
- If updating an existing skill, edit the smallest relevant section.
- After creating a skill, remind the user to run `/reload` or resync/restart Pi as appropriate.

## Output Format

When reporting back, use:

```markdown
# Session Lessons Report

## Pattern

<one-sentence repeated mistake>

## Evidence

- <session/date>: <brief redacted evidence>

## Root Cause

<classification plus explanation>

## Recommended Durable Fix

<new skill | existing skill update | AGENTS.md | docs/tooling>

## Proposed Change

<summary or path written>

## Follow-up

<reload/sync/test instructions>
```

## Quality Bar

A good result prevents future behavior, not just describes the past. The durable fix should be specific enough that a fresh agent can load it, recognize the trigger, and avoid the same mistake without rereading the original transcript.
