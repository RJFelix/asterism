import type { ServerSettings, ServerSettingsError } from "@t3tools/contracts";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as Stream from "effect/Stream";

export interface ServerSettingsServiceShape {
  readonly getSettings: Effect.Effect<ServerSettings, ServerSettingsError>;
  readonly streamChanges: Stream.Stream<ServerSettings>;
}

export class ServerSettingsService extends Context.Service<
  ServerSettingsService,
  ServerSettingsServiceShape
>()("t3/serverSettings/ServerSettingsService") {}
