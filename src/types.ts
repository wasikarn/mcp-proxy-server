export interface IStdioServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface IProxyConfig {
  servers: Record<string, IStdioServerConfig>;
}
