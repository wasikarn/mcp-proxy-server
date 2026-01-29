import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { IStdioServerConfig } from "./types.js";

/**
 * Manages a single backend stdio MCP server.
 * Spawns the subprocess, connects as MCP client, and can create
 * proxy Server instances that forward requests to the backend.
 */
export class BackendConnection {
  private client: Client;
  private transport: StdioClientTransport;
  public ready = false;

  constructor(
    public readonly name: string,
    private readonly _config: IStdioServerConfig,
  ) {
    this.transport = new StdioClientTransport({
      command: _config.command,
      args: _config.args ?? [],
      env: _config.env ? { ...Bun.env, ..._config.env } as Record<string, string> : undefined,
    });

    this.client = new Client(
      { name: `mcp-proxy/${name}`, version: "1.0.0" },
    );
  }

  async start(): Promise<void> {
    await this.client.connect(this.transport);
    this.ready = true;
    console.log(`[${this.name}] Connected (pid: ${this.transport.pid})`);

    const caps = this.client.getServerCapabilities();
    if (caps?.tools) console.log(`  → tools: enabled`);
    if (caps?.resources) console.log(`  → resources: enabled`);
    if (caps?.prompts) console.log(`  → prompts: enabled`);
  }

  async stop(): Promise<void> {
    this.ready = false;
    await this.client.close();
    console.log(`[${this.name}] Disconnected`);
  }

  /**
   * Creates a new MCP Server that proxies all requests to the backend.
   * Each HTTP session gets its own Server + Transport pair.
   */
  createProxyServer(): Server {
    const caps = this.client.getServerCapabilities() ?? {};

    const server = new Server(
      { name: `mcp-proxy/${this.name}`, version: "1.0.0" },
      {
        capabilities: {
          ...(caps.tools && { tools: caps.tools }),
          ...(caps.resources && { resources: caps.resources }),
          ...(caps.prompts && { prompts: caps.prompts }),
        },
      },
    );

    // Forward tool requests
    if (caps.tools) {
      server.setRequestHandler(ListToolsRequestSchema, async (req) => {
        return await this.client.listTools(req.params);
      });
      server.setRequestHandler(CallToolRequestSchema, async (req) => {
        return await this.client.callTool(req.params) as any;
      });
    }

    // Forward resource requests
    if (caps.resources) {
      server.setRequestHandler(ListResourcesRequestSchema, async (req) => {
        return await this.client.listResources(req.params);
      });
      server.setRequestHandler(ListResourceTemplatesRequestSchema, async (req) => {
        return await this.client.listResourceTemplates(req.params);
      });
      server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
        return await this.client.readResource(req.params);
      });
    }

    // Forward prompt requests
    if (caps.prompts) {
      server.setRequestHandler(ListPromptsRequestSchema, async (req) => {
        return await this.client.listPrompts(req.params);
      });
      server.setRequestHandler(GetPromptRequestSchema, async (req) => {
        return await this.client.getPrompt(req.params);
      });
    }

    return server;
  }
}

/**
 * Manages all backend connections.
 */
export class ProxyManager {
  private backends = new Map<string, BackendConnection>();

  async startAll(servers: Record<string, IStdioServerConfig>): Promise<void> {
    const entries = Object.entries(servers);
    console.log(`Starting ${entries.length} backend server(s)...\n`);

    for (const [name, config] of entries) {
      const backend = new BackendConnection(name, config);
      try {
        await backend.start();
        this.backends.set(name, backend);
      } catch (err) {
        console.error(`[${name}] Failed to start: ${err}`);
      }
    }

    console.log();
  }

  getBackend(name: string): BackendConnection | undefined {
    return this.backends.get(name);
  }

  getBackendNames(): string[] {
    return Array.from(this.backends.keys());
  }

  async stopAll(): Promise<void> {
    for (const backend of this.backends.values()) {
      await backend.stop().catch(() => {});
    }
    this.backends.clear();
  }
}
