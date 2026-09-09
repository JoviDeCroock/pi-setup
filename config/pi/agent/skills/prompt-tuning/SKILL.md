---
name: prompt-tuning
description: Audit and rewrite AGENTS.md files, SKILL.md files, and agent definitions against current OpenAI GPT-6 Astra / GPT-5.6 prompting guidance. Use when asked to optimize, tighten, review, or migrate a prompt, skill, agent definition, or AGENTS.md, or when a model starts over-asking, over-formatting, over-testing, or under-delegating.
---

# Prompt Tuning

Use this skill to make durable instruction files work well with the models in this setup: `gpt-6-astra` (main session, medium thinking) and the `gpt-5.6-*` family (Sol, Luna). The guidance is distilled from the OpenAI "latest model" guide; the verbatim recommended snippets and behavior notes are in `references/gpt-6-astra.md`. Read that file before rewriting anything, and refresh it from the source URL when the model defaults change.

## When to Use

- "Optimize / tighten / review this AGENTS.md or SKILL.md."
- "Migrate this prompt to GPT-6 Astra."
- The model repeatedly asks for approval on reversible work, writes long formatted answers, writes tests for trivial changes, or does not delegate when it could.
- A new skill or agent definition is being added to this repository.

## Model Behavior to Design For

GPT-6 Astra, compared with GPT-5.x:

- asks a question more readily when extra input could change the result, so over-cautious approval loops need an explicit bias-to-action instruction;
- is more sensitive to instructions in skills and other loaded files, so conflicting or stale guidance gets followed, not ignored;
- tends toward detailed, formatted responses with recurring phrases unless told to write plain paragraphs;
- may delegate less often than a workflow wants, so parallelizable work needs an explicit delegation instruction;
- tends to test thoroughly before calling a task complete, so testing rigor needs calibration for low-impact changes;
- does not support `none` reasoning effort; the lowest is `low`.

## Procedure

### 1. Inventory the instruction surface

List every file that reaches the model for the task at hand: global `AGENTS.md`, project `AGENTS.md`, the loaded `SKILL.md` files, and any agent definition frontmatter. For this repository that is `config/pi/agent/AGENTS.md`, `config/pi/agent/APPEND_SYSTEM.md`, `config/pi/agent/skills/*/SKILL.md`, and `config/pi/agent/agents/*.md`. Note which file owns each rule so a fix lands once.

### 2. Score each file against the checklist

For each file, record a pass or a concrete defect per item.

**Precedence and conflicts**

- The file states, or inherits, that user instructions outrank skill guidance.
- When a skill and the user conflict, the model is told to name the exact `SKILL.md` and quote the conflicting line rather than silently pick one.
- No two loaded files give contradictory rules for the same situation. Astra follows file instructions closely, so contradictions surface as flaky behavior.

**Initiative and follow-through**

- Requests phrased as "can you", "I want to", or "could we" are treated as action directives, not yes/no questions.
- The model is told to infer intent and scope from context, bias toward action, and carry the task to completion rather than stopping at a partial result.
- Approval is requested only for irreversible, outward-facing, or scope-changing actions, with a concrete reviewable result prepared first. No unsolicited warnings, disclaimers, or approval flows.
- Questions to the user are reserved for input that would materially change the result.

**Writing style**

- Default output is clear, concise paragraphs in plain language. Lists only for genuinely parallel items; no nested lists.
- The file bans filler and canned phrasing ("Bottom line", "delve", "leverage", transitional boilerplate) and asks for the intended action stated directly.
- Technical depth is calibrated to the assumed reader.

**Delegation**

- Work that can run in parallel is explicitly routed to subagents, naming which tier (`luna` for scouting and bounded implementation, `sol` for deep reasoning and review).
- Inter-agent messages are required to be legible: full sentences, explicit scope, expected output shape, side-effect boundaries.

**Testing and verification**

- Testing rigor is calibrated: no new tests for reversible, low-impact changes that only mirror the implementation; no repeated re-runs of the same check unless a failure justifies it.
- The repository-prescribed verification command is named once, in one file.

**Structure and economy**

- Frontmatter `name` matches the directory or filename, and `description` states the trigger, not just the topic.
- Every rule is actionable by a fresh agent without extra context. Remove rules that restate model defaults, duplicate another file, or describe history instead of behavior.
- The file is as short as it can be while still being unambiguous. Prefer one strong sentence over three hedged ones.

**Model and thinking settings** (agent definitions and settings only)

- `model` and `thinking` match the routing documented in `docs/personal-setup.md`.
- No `none` or `minimal` reasoning effort; use `low` at minimum. No `temperature` or `top_p` style parameters.

### 3. Rewrite

- Fix the owning file only; do not copy a rule into every skill.
- Use the recommended snippets in `references/gpt-6-astra.md` as the starting wording, then trim to what this file actually needs.
- Keep the change reviewable: a short diff per file, with a one-line reason per removed or rewritten rule.
- Do not add new capabilities, tools, or workflows while tuning; that is a separate task.

### 4. Verify

- `pnpm pi:doctor` passes when files in this repository changed.
- Re-read the full set of loaded files once more for contradictions introduced by the rewrite.
- If the trigger was observed misbehavior, restate the observed behavior and point to the exact line that now prevents it.

## Anti-Patterns

- Do not add "be careful" or "always ask first" language to fix a single incident; it produces the over-caution Astra is prone to.
- Do not pad a skill with general best practices the model already follows.
- Do not encode model names or thinking levels in more than one place beyond the agent frontmatter and the settings template.
- Do not rewrite upstream-copied skills (`agent-browser`, `agent-device`, `dogfood`, `react-devtools`); report findings instead so they can be raised upstream or re-synced.

## Output Format

```markdown
# Prompt Tuning Report

## Files reviewed

- <path>: <pass | n defects>

## Defects and fixes

- <path>:<rule> — <defect> → <fix applied or proposed>

## Conflicts between files

- <file A> vs <file B>: <rule> → <resolution>

## Not changed

- <path>: <reason, e.g. upstream-owned>
```
