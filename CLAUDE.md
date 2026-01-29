# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code)
when working with code in this repository.

## Commands

```bash
bun run start          # Run server
bun run dev            # Run with watch mode (auto-reload)
bun run mcp:status     # Check daemon status + health
bun run mcp:restart    # Restart as background daemon
bun run mcp:log        # Tail daemon logs
```

No build step required — Bun runs TypeScript directly.

## Architecture

**stdio-to-HTTP proxy** that spawns MCP servers as stdio
subprocesses and exposes them over Streamable HTTP transport
on a single port.

```text
HTTP client → Bun.serve (index.ts)
  → session lookup/create (WebStandardStreamableHTTPServerTransport)
  → proxy Server (proxy.ts: createProxyServer)
  → MCP Client → StdioClientTransport → subprocess
```

### Key files

- `src/index.ts` — HTTP server, routing
  (`/mcp/{name}`, `/health`, `/`), session management
- `src/proxy.ts` — `BackendConnection` (single backend) and
  `ProxyManager` (all backends). Each HTTP session gets its
  own proxy `Server` instance that forwards requests to a
  shared `Client` connected to the backend subprocess
- `src/config.ts` — Loads `config.json` via `Bun.file()`,
  validates server entries
- `src/types.ts` — `IStdioServerConfig`, `IProxyConfig`

### Session model

Each new client request without `mcp-session-id` header
creates a new `WebStandardStreamableHTTPServerTransport` +
proxy `Server`. Subsequent requests with the same session ID
reuse the existing transport. Transport cleanup removes the
session from the map.

### Config

- `config.json` (gitignored) — defines backend servers with
  `command`, `args`, optional `env`
- `.env` (gitignored) — `PORT=9802`
- Port defaults to 9802 if unset

## Conventions

- Pure Bun runtime — use `Bun.file()`, `Bun.env`,
  `Bun.serve()`, `import.meta.dir` instead of Node.js
  equivalents
- No Express or Node.js HTTP modules
- MCP SDK imports use `.js` extension in paths (ESM)
