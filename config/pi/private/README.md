# Private Pi Config

Use this directory for machine-local or secret material that should not be committed.

Suggested uses:

- experimental local-only extensions
- provider-specific environment notes
- personal prompt fragments
- workstation-specific Pi settings overlays

`pnpm pi:sync` automatically deep-merges `settings.overlay.json` from this directory into the rendered `~/.pi/agent/settings.json` when the overlay exists. Object values merge recursively; arrays and scalars replace the template value.

Everything in this directory is ignored by git except this file.
