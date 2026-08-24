# Private Pi Config

Use this directory for machine-local or secret material that should not be committed.

Suggested uses:

- experimental local-only extensions
- provider-specific environment notes
- personal prompt fragments
- workstation-specific Pi settings overlays
- local knowledge-vault paths for optional AGENTS guidance

`pnpm pi:sync` automatically deep-merges `settings.overlay.json` from this directory into the rendered `~/.pi/agent/settings.json` when the overlay exists. Object values merge recursively; arrays and scalars replace the template value.

To opt into personal knowledge-capture guidance, copy `agent-context.example.json` to ignored `agent-context.json` and set your vault path:

```json
{
  "vault": "/Users/example/Documents/brain"
}
```

`pnpm pi:sync` replaces `<VAULT>` in guarded AGENTS blocks with that path and omits those blocks when no vault is configured.

The tracked `config/pi/agent/mcp.json` contains only the Notion endpoint and OAuth mode. Never add OAuth tokens, callback codes, authorization URLs, bearer headers, or MCP cache contents to either tracked config or a settings overlay. `pi-mcp-adapter` stores persistent OAuth credentials in the operating-system credential store.

Everything in this directory is ignored by git except this file and tracked example files.
