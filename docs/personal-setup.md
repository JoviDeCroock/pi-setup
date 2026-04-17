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

`pnpm pi:sync` copies:

- `config/pi/agent/AGENTS.md`
- `config/pi/agent/prompts/`
- `config/pi/agent/skills/`
- a rendered `settings.json` with absolute extension paths

## Health checks

Run:

```bash
pnpm pi:doctor
```

It verifies the config template, prompts, skills, and built extension entry points. It also reports whether a synced `settings.json` already exists in your Pi home.

For skills specifically, `pnpm pi:doctor` now checks that each `SKILL.md` starts with YAML frontmatter and includes the required `name` and `description` fields.

## Private overlays

Use `config/pi/private/` for anything that should stay local to your workstation.

Use `config/pi/extensions.local/` for one-off local extension files or experiments that should not be tracked in git.
