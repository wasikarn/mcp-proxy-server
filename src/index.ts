import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { loadConfig } from "./config.js";
import { ProxyManager } from "./proxy.js";

const config = await loadConfig();
const manager = new ProxyManager();

// Track active transports per session
const sessions = new Map<string, WebStandardStreamableHTTPServerTransport>();

/**
 * Extract serverName from pathname like /mcp/sequential-thinking
 */
function parseMcpRoute(pathname: string): string | null {
  const match = pathname.match(/^\/mcp\/([^/]+)$/);
  return match ? match[1] : null;
}

function jsonResponse(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

/**
 * MCP Streamable HTTP handler per backend server.
 */
async function handleMcp(req: Request, serverName: string): Promise<Response> {
  const backend = manager.getBackend(serverName);

  if (!backend) {
    return jsonResponse({ error: `Server '${serverName}' not found` }, 404);
  }

  if (!backend.ready) {
    return jsonResponse({ error: `Server '${serverName}' not ready` }, 503);
  }

  // Check for existing session
  const sessionId = req.headers.get("mcp-session-id") ?? undefined;

  const existingTransport = sessionId ? sessions.get(sessionId) : undefined;
  if (existingTransport) {
    return existingTransport.handleRequest(req);
  }

  // New session — create transport + proxy server
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => {
      const id = crypto.randomUUID();
      sessions.set(id, transport);
      return id;
    },
  });

  transport.onclose = () => {
    if (transport.sessionId) {
      sessions.delete(transport.sessionId);
    }
  };

  const server = backend.createProxyServer();
  await server.connect(transport);
  return transport.handleRequest(req);
}

// Startup
await manager.startAll(config.servers);

const server = Bun.serve({
  port: Number(Bun.env.PORT) || 9802,
  async fetch(req) {
    const url = new URL(req.url);
    const { pathname } = url;

    // MCP endpoint
    const serverName = parseMcpRoute(pathname);
    if (serverName) {
      return handleMcp(req, serverName);
    }

    // Health check
    if (pathname === "/health" && req.method === "GET") {
      return jsonResponse({
        status: "ok",
        servers: manager.getBackendNames(),
        sessions: sessions.size,
      });
    }

    // List available servers
    if (pathname === "/" && req.method === "GET") {
      const servers = manager.getBackendNames().map((name) => ({
        name,
        endpoint: `/mcp/${name}`,
      }));
      return jsonResponse({ servers });
    }

    return jsonResponse({ error: "Not Found" }, 404);
  },
});

console.log(`MCP Proxy Server running on http://localhost:${server.port}`);
console.log();
console.log("Available endpoints:");
for (const name of manager.getBackendNames()) {
  console.log(`  → http://localhost:${server.port}/mcp/${name}`);
}
console.log(`  → http://localhost:${server.port}/health`);
console.log();

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\nShutting down...");
  await manager.stopAll();
  server.stop();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await manager.stopAll();
  server.stop();
  process.exit(0);
});
