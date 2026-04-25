# Personal Setup

## Global Pi home

The intended global install target is:

```text
~/.pi/agent
```

Use the sync script to render and install the repo-managed config:

```bash
pnpm build
pnpm pi:sync
```

Useful variants:

```bash
pnpm pi:sync -- --dry-run
pnpm pi:sync -- --target C:\\temp\\pi-agent
```

Sync refuses to write settings that point at missing built extension entry points. Run `pnpm build` first, or pass `--allow-missing-extensions` only when you intentionally want a partial config.

`pnpm pi:sync` copies:

- `config/pi/agent/AGENTS.md`
- `config/pi/agent/prompts/`
- `config/pi/agent/skills/`
- a rendered `settings.json` with absolute extension paths

The managed `AGENTS.md` is intentionally small: it carries always-on operating defaults and tells the agent to suggest a Pi skill when a session reveals a repeatable workflow, checklist, or specialized procedure.

The rendered settings also set:

```json
"npmCommand": ["pnpm"]
```

That makes Pi run package-manager operations through `pnpm`. The package entries themselves still use `npm:` sources because that is Pi's package-source prefix.

The rendered global settings also declare curated package-based defaults. The pins live in `config/pi/agent/package-policy.json`, and every npm version there must be at least 7 days old before it is promoted:

- `npm:pi-powerline-footer`
- `npm:@tmustier/pi-usage-extension`
- `npm:pi-subagents` — async subagent delegation with chains, parallel execution, and TUI clarification
- `npm:pi-web-access` — `web_search`, `code_search`, `fetch_content`, and `get_search_content` tools (works zero-config via Exa MCP)

## RTK (Rust Token Killer)

[RTK](https://github.com/rtk-ai/rtk) is a standalone CLI that compresses the output of common shell commands (`ls`, `cat`, `grep`, `git`, test runners, linters, etc.) before the agent sees it. RTK itself does not ship a Pi extension, so this repo provides `rtk-rewrite`, a small Pi extension that uses `rtk rewrite` to transparently rewrite Pi Bash tool calls like `git status` into `rtk git status`.

### Install

```bash
# macOS / Linux
brew install rtk
# or: cargo install --git https://github.com/rtk-ai/rtk

# No RTK hook init is required for Pi; the repo-built rtk-rewrite extension calls `rtk rewrite` directly.
# Use `rtk init -g` only if you also want RTK's upstream hooks for other agents.
```

### Windows notes

- The Rust binary runs on Windows (grab `rtk-x86_64-pc-windows-msvc.zip` from [releases](https://github.com/rtk-ai/rtk/releases) and put `rtk.exe` on PATH). The repo-built Pi extension only needs the binary, not RTK's shell hook.
- From PowerShell / Command Prompt, you can still call `rtk <cmd>` directly (e.g. `rtk git status`, `rtk read file.ts`) even without any hook.

### Verify

```bash
rtk --version
pnpm pi:doctor        # reports whether rtk is on PATH
```

`pnpm pi:doctor` treats RTK as optional: a missing binary is surfaced as a hint, not a failure. If the binary is missing at runtime, `rtk-rewrite` disables rewrites for that session and Bash commands continue unchanged.

## Health checks

Run:

```bash
pnpm pi:doctor
```

It verifies the config template, prompts, skills, and built extension entry points. It also reports whether a synced `settings.json` already exists in your Pi home.

For skills specifically, `pnpm pi:doctor` now checks that each `SKILL.md` starts with YAML frontmatter and includes the required `name` and `description` fields.
For third-party package defaults, it also checks that every `npm:` source is pinned to an exact version and that the curated versions in `config/pi/agent/package-policy.json` satisfy the 7-day minimum release age. It validates the final rendered settings after applying `config/pi/private/settings.overlay.json` when that private overlay exists.

## Private overlays

Use `config/pi/private/` for anything that should stay local to your workstation. A `settings.overlay.json` file in that directory is ignored by git and merged into the rendered Pi settings by `pnpm pi:sync`.

Use `config/pi/extensions.local/` for one-off local extension files or experiments that should not be tracked in git.
