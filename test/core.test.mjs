import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import {
  makeSqliteEventSink,
  makePeerFederation,
  assertSameLinkOrigin,
  assertNotFencedLink,
  namespaceForwardedRequestId,
  selectBestRoute,
  preflightRouteUpgrade,
} from "@asterism/core";
import { createAsterismServer, EXTRACTED_PROVIDER_CATALOG } from "../server.mjs";

test("1. All 11 extracted T3 provider harness packages load and expose capabilities", async () => {
  assert.equal(EXTRACTED_PROVIDER_CATALOG.length, 11);
  const ids = EXTRACTED_PROVIDER_CATALOG.map((p) => p.id);
  assert.deepEqual(ids, [
    "codex",
    "claudeAgent",
    "antigravity",
    "pi",
    "opencode",
    "cursor",
    "muse",
    "grok",
    "fx",
    "kiro",
    "acp-registry",
  ]);
  for (const entry of EXTRACTED_PROVIDER_CATALOG) {
    assert.ok(entry.capabilities.sessions, `Missing sessions capability on ${entry.id}`);
    assert.ok(entry.capabilities.tools, `Missing tools capability on ${entry.id}`);
  }
});

test("2. Rebuilt Effect-TS SQLite EventSink + Outbox enforces idempotency and per-stream FIFO ordering", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "asterism-outbox-"));
  const dbPath = path.join(tmpDir, "test.sqlite");
  const sink = Effect.runSync(makeSqliteEventSink(dbPath));

  // Commit command 1 with two outbox effects on stream "node-1"
  const commit1 = await Effect.runPromise(
    sink.commitCommand({
      commandId: "cmd-100",
      streamId: "node-1",
      commandType: "node.mutate",
      events: [{ eventType: "surface.mutated", payload: { nodeId: "node-1" } }],
      effects: [
        { id: "eff-1", request: { type: "surface.mutate", nodeId: "node-1", instruction: "First" } },
        { id: "eff-2", request: { type: "surface.mutate", nodeId: "node-1", instruction: "Second" } },
      ],
    }),
  );

  assert.equal(commit1.committed, true);
  assert.equal(commit1.resultSequence, 1);
  assert.deepEqual(commit1.enqueuedEffectIds, ["eff-1", "eff-2"]);

  // Duplicate commandId returns existing receipt without re-inserting events or effects
  const dupCommit = await Effect.runPromise(
    sink.commitCommand({
      commandId: "cmd-100",
      streamId: "node-1",
      commandType: "node.mutate",
      events: [{ eventType: "surface.mutated", payload: { nodeId: "node-1" } }],
      effects: [{ id: "eff-dup", request: { type: "surface.mutate", nodeId: "node-1", instruction: "Dup" } }],
    }),
  );
  assert.equal(dupCommit.committed, false);
  assert.equal(dupCommit.resultSequence, 1);

  // Claim first effect on stream "node-1"
  const claim1 = await Effect.runPromise(sink.claimNextEffect("worker-a"));
  assert.equal(Option.isSome(claim1), true);
  assert.equal(Option.getOrThrow(claim1).id, "eff-1");

  // While eff-1 is running on stream "node-1", eff-2 on the same stream is blocked (FIFO per stream)
  const blockedClaim = await Effect.runPromise(sink.claimNextEffect("worker-b"));
  assert.equal(Option.isNone(blockedClaim), true);

  // Complete eff-1 -> now eff-2 is claimable!
  await Effect.runPromise(sink.completeEffect({ effectId: "eff-1", workerId: "worker-a" }));
  const claim2 = await Effect.runPromise(sink.claimNextEffect("worker-b"));
  assert.equal(Option.isSome(claim2), true);
  assert.equal(Option.getOrThrow(claim2).id, "eff-2");

  // Simulate process loss while eff-2 is running -> reconcileAfterProcessLoss requeues it
  const reconciled = await Effect.runPromise(sink.reconcileAfterProcessLoss);
  assert.equal(reconciled.requeued, 1);
});

test("3. Rebuilt Peer Federation (/mcp JSON-RPC + T3-Mode-Limit + LinkOrigin Fencing)", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "asterism-peer-"));
  const server = createAsterismServer({ dbPath: path.join(tmpDir, "peer.sqlite") });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const peerService = Effect.runSync(makePeerFederation());
    await Effect.runPromise(
      peerService.registerPeer({
        environmentId: "env-peer-remote",
        label: "Remote Lab Box",
        url: baseUrl,
        token: "test-peer-token",
        access: "workspace-write",
        lastError: null,
      }),
    );

    const summary = await Effect.runPromise(
      peerService.callTool({
        environmentId: "env-peer-remote",
        tool: "asterism_canvas_summary",
        arguments: {},
        limits: { runtimeMode: "read-only", interactionMode: "plan" },
      }),
    );

    assert.equal(summary.modeLimit, "read-only/plan");
    assert.ok(summary.nodeCount >= 4);

    // Verify LinkOrigin fencing rules
    const fencedOrigin = {
      sessionId: "sess-link-1",
      label: "Laptop Link",
      access: "workspace-write",
    };

    // Allowed when mutating work from the same link
    await Effect.runPromise(assertSameLinkOrigin(fencedOrigin, fencedOrigin));

    // Rejected when mutating work from a different link or local user
    await assert.rejects(() =>
      Effect.runPromise(
        assertSameLinkOrigin(fencedOrigin, {
          sessionId: "sess-other",
          label: "Other",
          access: "full-access",
        }),
      ),
    );

    // Rejected when attempting transitive peer hopping from a fenced link
    await assert.rejects(() =>
      Effect.runPromise(
        peerService.callTool({
          environmentId: "env-peer-remote",
          tool: "asterism_canvas_summary",
          arguments: {},
          limits: { runtimeMode: "read-only", interactionMode: "default" },
          callerOrigin: fencedOrigin,
        }),
      ),
    );

    // Deterministic SHA-256 request ID namespacing across peer hops
    const fwd1 = namespaceForwardedRequestId("sess-1", "req-abc");
    const fwd2 = namespaceForwardedRequestId("sess-2", "req-abc");
    assert.match(fwd1, /^fwd:[0-9a-f]{32}$/);
    assert.notEqual(fwd1, fwd2);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("4. Rebuilt Multi-Route Connection Supervisor gives direct routes head-start and upgrades from relay", async () => {
  const routes = [
    { id: "r-tailscale", kind: "tailscale", baseUrl: "http://100.64.0.1:3456", priority: 10 },
    { id: "r-relay", kind: "relay", baseUrl: "https://relay.example.com", priority: 50 },
  ];

  const winner = await Effect.runPromise(
    selectBestRoute({
      expectedEnvironmentId: "env-1",
      routes,
      headStartMs: 50,
      probeRoute: (route) =>
        Effect.succeed({ environmentId: "env-1", via: route.id }),
    }),
  );

  // Direct route (Tailscale) wins because relay route waits for the head-start window
  assert.equal(winner.route.id, "r-tailscale");

  // If currently on relay, preflightRouteUpgrade finds the newly available Tailscale route
  const upgrade = await Effect.runPromise(
    preflightRouteUpgrade({
      activeRoute: routes[1],
      allRoutes: routes,
      expectedEnvironmentId: "env-1",
      probeRoute: () => Effect.succeed({ environmentId: "env-1" }),
    }),
  );

  assert.equal(Option.isSome(upgrade), true);
  assert.equal(Option.getOrThrow(upgrade).route.id, "r-tailscale");
});
