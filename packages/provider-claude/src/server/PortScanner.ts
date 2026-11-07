import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

export const AGENT_THREAD_ENV = "T3_AGENT_THREAD_ID";

export class PortDiscovery extends Context.Service<
  PortDiscovery,
  {
    readonly watchProcessTree: (input: any) => Effect.Effect<void>;
    readonly scanThreadEnvironment: (input: any) => Effect.Effect<void>;
  }
>()("t3/preview/PortScanner/PortDiscovery") {
  static readonly layerNoop = Layer.succeed(PortDiscovery, {
    watchProcessTree: () => Effect.void,
    scanThreadEnvironment: () => Effect.void,
  });
}
