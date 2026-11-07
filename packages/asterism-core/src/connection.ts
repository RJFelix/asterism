import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

export type RouteKind = "loopback" | "lan" | "tailscale" | "ssh-tunnel" | "relay";

export interface CandidateRoute {
  readonly id: string;
  readonly kind: RouteKind;
  readonly baseUrl: string;
  readonly priority: number; // Lower number = higher priority (direct before relay)
}

export interface RouteProbeSuccess {
  readonly route: CandidateRoute;
  readonly environmentId: string;
  readonly latencyMs: number;
}

export const DIRECT_ROUTE_HEAD_START_MS = 500;

export const isDirectRoute = (kind: RouteKind): boolean =>
  kind === "loopback" || kind === "lan" || kind === "tailscale" || kind === "ssh-tunnel";

/**
 * Rebuilt from T3's `packages/client-runtime/src/connection/{driver,supervisor}.ts`:
 * Races candidate routes against `/api/environment/descriptor`, giving direct routes
 * (loopback, LAN, Tailscale, SSH tunnel) a 500ms head-start before relay routes start,
 * and supports periodic background preflight to upgrade an active relay session to a direct route.
 */
export const selectBestRoute = (input: {
  readonly expectedEnvironmentId?: string;
  readonly routes: ReadonlyArray<CandidateRoute>;
  readonly probeRoute: (
    route: CandidateRoute,
  ) => Effect.Effect<{ readonly environmentId: string }, Error>;
  readonly headStartMs?: number;
}): Effect.Effect<RouteProbeSuccess, Error> =>
  Effect.gen(function* () {
    const headStart = input.headStartMs ?? DIRECT_ROUTE_HEAD_START_MS;
    const hasDirect = input.routes.some((r) => isDirectRoute(r.kind));

    const ordered = [...input.routes].sort((a, b) => a.priority - b.priority);
    if (ordered.length === 0) {
      return yield* Effect.fail(new Error("No candidate routes configured"));
    }

    const runProbe = (route: CandidateRoute) =>
      Effect.gen(function* () {
        if (hasDirect && !isDirectRoute(route.kind) && headStart > 0) {
          yield* Effect.sleep(Duration.millis(headStart));
        }
        const t0 = Date.now();
        const descriptor = yield* input.probeRoute(route);
        if (
          input.expectedEnvironmentId !== undefined &&
          descriptor.environmentId !== input.expectedEnvironmentId
        ) {
          return yield* Effect.fail(
            new Error(
              `Route ${route.baseUrl} reported environmentId ${descriptor.environmentId}, expected ${input.expectedEnvironmentId}`,
            ),
          );
        }
        return {
          route,
          environmentId: descriptor.environmentId,
          latencyMs: Math.max(0, Date.now() - t0),
        } satisfies RouteProbeSuccess;
      });

    return yield* Effect.raceAll(ordered.map(runProbe));
  });

/**
 * Checks if a higher-priority route (e.g. Tailscale or LAN) has become reachable
 * while currently connected over a lower-priority route (e.g. relay).
 */
export const preflightRouteUpgrade = (input: {
  readonly activeRoute: CandidateRoute;
  readonly allRoutes: ReadonlyArray<CandidateRoute>;
  readonly expectedEnvironmentId?: string;
  readonly probeRoute: (
    route: CandidateRoute,
  ) => Effect.Effect<{ readonly environmentId: string }, Error>;
}): Effect.Effect<Option.Option<RouteProbeSuccess>> =>
  Effect.gen(function* () {
    const higherPriorityRoutes = input.allRoutes.filter(
      (r) => r.priority < input.activeRoute.priority,
    );
    if (higherPriorityRoutes.length === 0) return Option.none();

    return yield* selectBestRoute({
      expectedEnvironmentId: input.expectedEnvironmentId,
      routes: higherPriorityRoutes,
      probeRoute: input.probeRoute,
      headStartMs: 0,
    }).pipe(Effect.option);
  });
