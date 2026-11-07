import * as NodeCrypto from "node:crypto";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";

export const MCP_PROTOCOL_VERSION = "2025-06-18";
export const MODE_LIMIT_HEADER = "T3-Mode-Limit";
export const FORWARDED_WAIT_CHUNK_MS = 50_000;

export type PeerAccessLevel = "read-only" | "workspace-write" | "full-access";

export interface LinkOrigin {
  readonly sessionId: string;
  readonly label: string;
  readonly access: PeerAccessLevel;
}

export interface PeerEnvironmentRecord {
  readonly environmentId: string;
  readonly label: string;
  readonly url: string;
  readonly token: string;
  readonly access: PeerAccessLevel;
  readonly lastError: string | null;
}

export interface PeerCallLimits {
  readonly runtimeMode: "read-only" | "workspace-write" | "full-access";
  readonly interactionMode: "default" | "plan";
}

export class PeerFederationError extends Schema.TaggedError<PeerFederationError>()(
  "PeerFederationError",
  {
    code: Schema.Literals([
      "invalid_request",
      "capability_denied",
      "orchestration_error",
    ]),
    message: Schema.String,
  },
) {}

/**
 * Link-Origin Fencing (rebuilt from T3's `linkOrigin.ts`):
 * Any work initiated across a peer link paired below `full-access` carries an immutable
 * `linkOrigin` stamp. It may only mutate nodes/threads created by that same link session,
 * and can never hop transitively across links or modify host-wide settings.
 */
export const isLinkOriginFenced = (origin: LinkOrigin | undefined): boolean =>
  origin !== undefined && origin.access !== "full-access";

export const assertSameLinkOrigin = (
  callerOrigin: LinkOrigin | undefined,
  targetOrigin: LinkOrigin | undefined,
): Effect.Effect<void, PeerFederationError> => {
  if (!isLinkOriginFenced(callerOrigin)) return Effect.void;
  if (targetOrigin?.sessionId === callerOrigin!.sessionId) return Effect.void;
  return Effect.fail(
    new PeerFederationError({
      code: "capability_denied",
      message: `Work started from peer link "${callerOrigin!.label}" (${callerOrigin!.access}) may only modify nodes or threads created by that same link.`,
    }),
  );
};

export const assertNotFencedLink = (
  callerOrigin: LinkOrigin | undefined,
  operationDescription: string,
): Effect.Effect<void, PeerFederationError> => {
  if (!isLinkOriginFenced(callerOrigin)) return Effect.void;
  return Effect.fail(
    new PeerFederationError({
      code: "capability_denied",
      message: `Work started from peer link "${callerOrigin!.label}" (${callerOrigin!.access}) cannot ${operationDescription}.`,
    }),
  );
};

/**
 * Deterministic SHA-256 namespacing of `clientRequestId` across peer hops (`fwd:<hex>`)
 * so multiple local agents sharing one peer link never collide on idempotency keys.
 */
export const namespaceForwardedRequestId = (
  callerScopeKey: string,
  clientRequestId: string,
): string => {
  const digest = NodeCrypto.createHash("sha256")
    .update(`${callerScopeKey}\0${clientRequestId}`)
    .digest("hex")
    .slice(0, 32);
  return `fwd:${digest}`;
};

export interface PeerFederationShape {
  readonly registerPeer: (peer: PeerEnvironmentRecord) => Effect.Effect<void>;
  readonly listPeers: Effect.Effect<ReadonlyArray<PeerEnvironmentRecord>>;
  readonly callTool: <A>(input: {
    readonly environmentId: string;
    readonly tool: string;
    readonly arguments: Record<string, unknown>;
    readonly limits: PeerCallLimits;
    readonly callerOrigin?: LinkOrigin;
    readonly decode?: (raw: unknown) => A;
  }) => Effect.Effect<A, PeerFederationError>;
}

export class PeerFederation extends Context.Service<
  PeerFederation,
  PeerFederationShape
>()("@asterism/core/PeerFederation") {}

export const makePeerFederation = (
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
) =>
  Effect.gen(function* () {
    const peersRef = yield* Ref.make(new Map<string, PeerEnvironmentRecord>());
    // Cache `mcp-session-id` per `(environmentId, url)` and renew automatically on 404.
    const sessionsRef = yield* Ref.make(new Map<string, string>());

    const postMcp = (
      url: string,
      token: string,
      body: unknown,
      headers: Record<string, string>,
    ) =>
      Effect.tryPromise({
        try: () =>
          fetchImpl(`${url.replace(/\/+$/, "")}/mcp`, {
            method: "POST",
            headers: {
              accept: "application/json, text/event-stream",
              "content-type": "application/json",
              authorization: `Bearer ${token}`,
              ...headers,
            },
            body: JSON.stringify(body),
          }),
        catch: () =>
          new PeerFederationError({
            code: "orchestration_error",
            message: "The linked environment stopped answering.",
          }),
      });

    const openMcpSession = (
      url: string,
      token: string,
      limitHeader: Record<string, string>,
    ) =>
      Effect.gen(function* () {
        const initRes = yield* postMcp(
          url,
          token,
          {
            jsonrpc: "2.0",
            id: 0,
            method: "initialize",
            params: {
              protocolVersion: MCP_PROTOCOL_VERSION,
              capabilities: {},
              clientInfo: { name: "asterism-peer", version: "0.2.0" },
            },
          },
          limitHeader,
        );
        const sessionId = initRes.headers.get("mcp-session-id");
        if (initRes.status !== 200 || !sessionId) {
          return yield* new PeerFederationError({
            code: initRes.status === 401 ? "capability_denied" : "orchestration_error",
            message: `Linked environment refused MCP initialize (HTTP ${initRes.status}).`,
          });
        }
        yield* postMcp(
          url,
          token,
          { jsonrpc: "2.0", method: "notifications/initialized" },
          {
            ...limitHeader,
            "mcp-session-id": sessionId,
            "mcp-protocol-version": MCP_PROTOCOL_VERSION,
          },
        );
        return sessionId;
      });

    const callTool: PeerFederationShape["callTool"] = (input) =>
      Effect.gen(function* () {
        // Prevent transitive peer hopping from a fenced link
        yield* assertNotFencedLink(
          input.callerOrigin,
          "hop transitively to another linked environment",
        );

        const peer = (yield* Ref.get(peersRef)).get(input.environmentId);
        if (!peer) {
          return yield* new PeerFederationError({
            code: "invalid_request",
            message: `Unknown linked environment "${input.environmentId}".`,
          });
        }

        const limitHeader = {
          [MODE_LIMIT_HEADER]: `${input.limits.runtimeMode}/${input.limits.interactionMode}`,
        };
        const sessionKey = `${peer.environmentId} ${peer.url}`;
        const existingSession = (yield* Ref.get(sessionsRef)).get(sessionKey);
        const sessionId =
          existingSession ??
          (yield* openMcpSession(peer.url, peer.token, limitHeader));

        if (!existingSession) {
          yield* Ref.update(sessionsRef, (m) =>
            new Map(m).set(sessionKey, sessionId),
          );
        }

        const invokeOnce = (sid: string) =>
          postMcp(
            peer.url,
            peer.token,
            {
              jsonrpc: "2.0",
              id: 1,
              method: "tools/call",
              params: { name: input.tool, arguments: input.arguments },
            },
            {
              ...limitHeader,
              "mcp-session-id": sid,
              "mcp-protocol-version": MCP_PROTOCOL_VERSION,
            },
          );

        let res = yield* invokeOnce(sessionId);
        if (res.status === 404) {
          const renewed = yield* openMcpSession(peer.url, peer.token, limitHeader);
          yield* Ref.update(sessionsRef, (m) =>
            new Map(m).set(sessionKey, renewed),
          );
          res = yield* invokeOnce(renewed);
        }

        if (res.status !== 200) {
          return yield* new PeerFederationError({
            code: res.status === 401 ? "capability_denied" : "orchestration_error",
            message: `Linked environment HTTP ${res.status}`,
          });
        }

        const rawText = yield* Effect.tryPromise({
          try: () => res.text(),
          catch: () =>
            new PeerFederationError({
              code: "orchestration_error",
              message: "Failed reading peer response body.",
            }),
        });

        const jsonStr =
          res.headers.get("content-type")?.includes("text/event-stream")
            ? rawText
                .split("\n")
                .filter((l) => l.startsWith("data:"))
                .map((l) => l.slice(5).trim())
                .join("")
            : rawText;

        const parsed = JSON.parse(jsonStr) as {
          result?: {
            content?: Array<{ type: string; text?: string }>;
            isError?: boolean;
          };
          error?: { message: string };
        };

        if (parsed.error) {
          return yield* new PeerFederationError({
            code: "invalid_request",
            message: parsed.error.message,
          });
        }

        const contentText = (parsed.result?.content ?? [])
          .map((c) => c.text ?? "")
          .join("");
        const value = contentText ? JSON.parse(contentText) : parsed.result;
        return input.decode ? input.decode(value) : (value as any);
      });

    return PeerFederation.of({
      registerPeer: (peer) =>
        Ref.update(peersRef, (m) => new Map(m).set(peer.environmentId, peer)),
      listPeers: Ref.get(peersRef).pipe(
        Effect.map((m) => Array.from(m.values())),
      ),
      callTool,
    });
  });

export const layerPeerFederation = Layer.effect(
  PeerFederation,
  makePeerFederation(),
);
