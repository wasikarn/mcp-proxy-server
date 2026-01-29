# MCP Proxy Server

A lightweight stdio-to-HTTP proxy that exposes multiple
[MCP](https://modelcontextprotocol.io/) servers over a single
HTTP endpoint using the
[Streamable HTTP transport][streamable-http].
Built with [Bun](https://bun.sh/) and the official
[MCP TypeScript SDK][mcp-sdk].

[streamable-http]: https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http
[mcp-sdk]: https://github.com/modelcontextprotocol/typescript-sdk

## Why?

MCP clients like **Claude Desktop** and **Claude Code**
normally spawn a separate stdio subprocess for each MCP
server, per session. This proxy runs all backends once as
long-lived processes and exposes them via HTTP — so multiple
clients share the same server instances without duplicating
processes.

```text
┌─────────────────┐
│  Claude Desktop  │──┐
└─────────────────┘  │    ┌───────────────┐     ┌── stdio ── MCP Server A
┌─────────────────┐  ├───▶│  MCP Proxy    │─────┼── stdio ── MCP Server B
│  Claude Code    │──┤    │  (Bun HTTP)   │     └── stdio ── MCP Server C
└─────────────────┘  │    └───────────────┘
┌─────────────────┐  │     localhost:9802
│  Other Client   │──┘
└─────────────────┘
```

## Requirements

- [Bun](https://bun.sh/) v1.0+

## Quick Start

```bash
# Clone
git clone https://github.com/wasikarn/mcp-proxy-server.git
cd mcp-proxy-server

# Install dependencies
bun install

# Configure
cp config.example.json config.json
cp .env.example .env
# Edit config.json to add your MCP servers

# Run
bun run start
```

## Configuration

### `config.json`

Define your MCP backend servers. Each server must have a
`command` and optionally `args` and `env`:

```json
{
  "servers": {
    "sequential-thinking": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sequential-thinking@latest"]
    },
    "github": {
      "command": "github-mcp-server",
      "args": ["stdio"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_xxx"
      }
    }
  }
}
```

### `.env`

```bash
PORT=9802
```

## API Endpoints

| Method     | Path                 | Description                  |
| ---------- | -------------------- | ---------------------------- |
| `POST/GET` | `/mcp/{server-name}` | MCP Streamable HTTP endpoint |
| `GET`      | `/health`            | Health check with server list|
| `GET`      | `/`                  | List available servers       |

## Management Scripts

The project includes a management script at
`scripts/mcp-proxy.sh`:

```bash
# Using the script directly
./scripts/mcp-proxy.sh start
./scripts/mcp-proxy.sh stop
./scripts/mcp-proxy.sh restart
./scripts/mcp-proxy.sh status
./scripts/mcp-proxy.sh log

# Or via bun
bun run mcp:start
bun run mcp:status
```

The script manages the server as a background daemon with PID
tracking at `/tmp/mcp-proxy.pid` and logs at
`/tmp/mcp-proxy.log`.

## Client Configuration

### Claude Code

```bash
claude mcp add server-name \
  --transport http -s user \
  http://localhost:9802/mcp/server-name
```

### Claude Desktop

In `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "server-name": {
      "command": "mcp-remote",
      "args": [
        "http://localhost:9802/mcp/server-name",
        "--allow-http"
      ]
    }
  }
}
```

> Claude Desktop requires
> [mcp-remote](https://www.npmjs.com/package/mcp-remote)
> to bridge HTTP transport to stdio.

## Development

```bash
bun run dev   # Watch mode with auto-reload
```

## License

ISC
