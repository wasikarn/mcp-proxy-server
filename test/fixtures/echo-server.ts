// Minimal stdio MCP backend for tests: one tool, exits on SIGTERM.
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const server = new Server({ name: "echo", version: "0.0.0" }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{ name: "echo", description: "echo", inputSchema: { type: "object" } }],
}));
server.setRequestHandler(CallToolRequestSchema, async (req) => ({
  content: [{ type: "text", text: JSON.stringify(req.params.arguments ?? {}) }],
}));
await server.connect(new StdioServerTransport());
