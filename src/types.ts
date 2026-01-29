export interface IStdioServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface IProxyConfig {
  port: number;
  servers: Record<string, IStdioServerConfig>;
}

export interface IManagedServer {
  name: string;
  config: IStdioServerConfig;
  process: import("child_process").ChildProcess;
  ready: boolean;
}
