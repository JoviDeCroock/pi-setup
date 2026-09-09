# GPT-6 Astra prompting guidance

Source: https://developers.openai.com/api/docs/guides/latest-model (captured 2026-09-09). Refresh this file when the default model changes.

## What's new

- Async tool calling, mid-turn steering, and changing reasoning effort mid-conversation while preserving cache.
- The `none` reasoning effort is not supported; the minimum is `low`.

## Behavior notes and recommended prompt text

### Initiative and follow-through

Behavior: Astra is more likely to ask the user a question when additional input could materially change the result. If it repeatedly requests approval unnecessarily, add the initiative prompt.

Recommended wording:

> You should infer the user's intent and task scope from instructions and prior context. Bias towards action and carry the user's intended task to completion. Treat requests such as "can you..." or "I want to..." as directives to act, not yes/no questions. Complete all the necessary work until the intended outcome is fulfilled rather than settling for a partial solution. When approval is genuinely needed, prepare a concrete, reviewable result first. Do not introduce unsolicited warnings, disclaimers, or approval flows.

### Instruction following

Behavior: Astra can be more sensitive to instructions contained in skills and other files.

Recommended wording:

> The user's instructions take precedence over guidelines provided in a skill. When a skill conflicts with the user's request, name and link the exact SKILL.md file and quote the conflicting guidance before proceeding.

### Personality and writing style

Behavior: Astra tends toward detailed, formatted responses and may use recurring phrases.

Recommended wording:

> Default to using clear, concise paragraphs. Use lists only when information is genuinely parallel, and avoid nested lists. Use plain, simple language over jargon, and calibrate detail to the reader's assumed background. Avoid phrases such as "Bottom line", "delve", "leverage", and canned transitions. State the intended action directly.

### Subagent delegation

Behavior: Astra may delegate less often than desired for a workflow.

Recommended wording:

> If at any point you can parallelize work by delegating tasks to another agent, you should do so. Write inter-agent messages legibly, with proper spaces between words and numbers, an explicit scope, and the expected output shape.

### Testing and verification

Behavior: for coding, Astra tends to be thorough in testing before considering a task complete.

Recommended wording:

> Do not write tests for reversible, low-impact changes that mirror the implementation. Do not repeat the same check unless a failure justifies it.

## Migration quickstart

- Set `model` to `gpt-6-astra`.
- Replace `none` or `minimal` reasoning effort with `low`; use `reasoning.effort` (Responses API) or `reasoning_effort` (Chat Completions).
- Remove `temperature`, `top_p`, `top_logprobs`, and related logprob parameters.
- Prefer the Responses API for tool calling.
- Avoid Fast mode with EU data residency.
