export interface IStdioServerConfig {
  readonly command: string;
  readonly args: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
}

export interface IProxyConfig {
  readonly servers: Readonly<Record<string, IStdioServerConfig>>;
}
