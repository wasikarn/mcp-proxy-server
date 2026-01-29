import express from "express";
import { randomUUID } from "crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { loadConfig } from "./config.js";
import { ProxyManager } from "./proxy.js";

const config = loadConfig();
const manager = new ProxyManager();
const app = express();

app.use(express.json());

// Track active transports per session
const sessions = new Map<string, StreamableHTTPServerTransport>();

/**
 * MCP Streamable HTTP endpoint per backend server.
 * Handles both POST (client→server) and GET (SSE stream).
 */
app.all("/mcp/:serverName", async (req, res) => {
  const { serverName } = req.params;
  const backend = manager.getBackend(serverName);

  if (!backend) {
    res.status(404).json({ error: `Server '${serverName}' not found` });
    return;
  }

  if (!backend.ready) {
    res.status(503).json({ error: `Server '${serverName}' not ready` });
    return;
  }

  // Check for existing session
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  if (sessionId && sessions.has(sessionId)) {
    const transport = sessions.get(sessionId)!;
    await transport.handleRequest(req, res, req.body);
    return;
  }

  // New session — create transport + proxy server
  // Store session eagerly inside sessionIdGenerator so it's available
  // before handleRequest's streaming response completes.
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => {
      const id = randomUUID();
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
  await transport.handleRequest(req, res, req.body);
});

// Health check
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    servers: manager.getBackendNames(),
    sessions: sessions.size,
  });
});

// List available servers
app.get("/", (_req, res) => {
  const servers = manager.getBackendNames().map((name) => ({
    name,
    endpoint: `/mcp/${name}`,
  }));
  res.json({ servers });
});

// Startup
async function main() {
  await manager.startAll(config.servers);

  app.listen(config.port, () => {
    console.log(`MCP Proxy Server running on http://localhost:${config.port}`);
    console.log();
    console.log("Available endpoints:");
    for (const name of manager.getBackendNames()) {
      console.log(`  → http://localhost:${config.port}/mcp/${name}`);
    }
    console.log(`  → http://localhost:${config.port}/health`);
    console.log();
  });
}

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\nShutting down...");
  await manager.stopAll();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await manager.stopAll();
  process.exit(0);
});

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
