import { readFileSync } from "fs";
import { resolve } from "path";
import type { IProxyConfig } from "./types.js";

const DEFAULT_CONFIG_PATH = resolve(process.cwd(), "config.json");

export function loadConfig(path?: string): IProxyConfig {
  const configPath = path ?? DEFAULT_CONFIG_PATH;

  const raw = readFileSync(configPath, "utf-8");
  const parsed = JSON.parse(raw) as IProxyConfig;

  if (!parsed.port || typeof parsed.port !== "number") {
    throw new Error("config.json: 'port' must be a number");
  }

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
