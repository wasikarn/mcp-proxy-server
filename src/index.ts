import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { loadConfig } from "./config.js";
import { ProxyManager } from "./proxy.js";

const config = await loadConfig();
const manager = new ProxyManager();

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const CLEANUP_INTERVAL_MS = 60 * 1000; // check every 60s

interface TrackedSession {
  transport: WebStandardStreamableHTTPServerTransport;
  lastActivity: number;
  serverName: string;
}

// Track active transports per session
const sessions = new Map<string, TrackedSession>();

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
 * Close and remove sessions that have been idle longer than SESSION_TIMEOUT_MS.
 */
function purgeStale(): number {
  const now = Date.now();
  let purged = 0;
  for (const [id, session] of sessions) {
    if (now - session.lastActivity > SESSION_TIMEOUT_MS) {
      session.transport.close().catch(() => {});
      sessions.delete(id);
      purged++;
    }
  }
  if (purged > 0) {
    console.log(`[sessions] Purged ${purged} stale session(s) (${sessions.size} remaining)`);
  }
  return purged;
}

const cleanupInterval = setInterval(purgeStale, CLEANUP_INTERVAL_MS);

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

  const existing = sessionId ? sessions.get(sessionId) : undefined;
  if (existing) {
    existing.lastActivity = Date.now();
    return existing.transport.handleRequest(req);
  }

  // New session — create transport + proxy server
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => {
      const id = crypto.randomUUID();
      sessions.set(id, { transport, lastActivity: Date.now(), serverName });
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
      const now = Date.now();
      let active = 0;
      let stale = 0;
      for (const session of sessions.values()) {
        if (now - session.lastActivity > SESSION_TIMEOUT_MS) {
          stale++;
        } else {
          active++;
        }
      }
      return jsonResponse({
        status: "ok",
        servers: manager.getBackendNames(),
        sessions: { total: sessions.size, active, stale },
      });
    }

    // Purge stale sessions
    if (pathname === "/sessions" && req.method === "DELETE") {
      const purged = purgeStale();
      return jsonResponse({ purged, remaining: sessions.size });
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
  clearInterval(cleanupInterval);
  await manager.stopAll();
  server.stop();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  clearInterval(cleanupInterval);
  await manager.stopAll();
  server.stop();
  process.exit(0);
});
