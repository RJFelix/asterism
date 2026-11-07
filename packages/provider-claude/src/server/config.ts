import * as Context from "effect/Context";

export interface ServerConfigShape {
  readonly cwd: string;
  readonly baseDir: string;
  readonly stateDir: string;
  readonly attachmentsDir: string;
  readonly logsDir: string;
  readonly providerLogsDir: string;
  readonly providerEventLogPath: string;
  readonly providerStatusCacheDir: string;
  readonly settingsPath: string;
}

export class ServerConfig extends Context.Service<ServerConfig, ServerConfigShape>()(
  "t3/config/ServerConfig",
) {}
