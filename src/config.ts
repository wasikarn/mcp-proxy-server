import type { IProxyConfig } from "./types.js";

const DEFAULT_CONFIG_PATH = `${import.meta.dir}/../config.json`;

export async function loadConfig(path?: string): Promise<IProxyConfig> {
  const configPath = path ?? DEFAULT_CONFIG_PATH;

  const parsed = await Bun.file(configPath).json() as IProxyConfig;

  if (!parsed.servers || typeof parsed.servers !== "object") {
    throw new Error("config.json: 'servers' must be an object");
  }

  for (const [name, server] of Object.entries(parsed.servers)) {
    if (!server.command || typeof server.command !== "string") {
      throw new Error(`config.json: server '${name}' must have a 'command' string`);
    }
    if (!Array.isArray(server.args)) {
      parsed.servers[name].args = [];
    }
  }

  return parsed;
}
