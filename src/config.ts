import { z } from "zod";
import type { IProxyConfig } from "./types.js";

const DEFAULT_CONFIG_PATH = `${import.meta.dir}/../config.json`;

// Rejects the two shapes the router (index.ts /^\/mcp\/([^/]+)$/) can never match: "/" in the
// name, or an empty name. Other names must still be URL-safe ASCII to be reachable.
const serverName = z.string().min(1).regex(/^[^/]+$/, "server name must not contain '/'");

const stdioServerSchema = z.object({
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  env: z.record(z.string(), z.string()).optional(),
});

const proxyConfigSchema = z.object({
  servers: z.record(serverName, stdioServerSchema),
});

export async function loadConfig(path?: string): Promise<IProxyConfig> {
  const configPath = path ?? DEFAULT_CONFIG_PATH;
  const raw: unknown = await Bun.file(configPath).json();
  const result = proxyConfigSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`config.json: ${z.prettifyError(result.error)}`);
  }
  return result.data;
}
