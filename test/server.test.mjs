import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import * as Effect from "effect/Effect";
import { removeIsolatedWorktree } from "@asterism/core";
import { createAsterismServer } from "../server.mjs";

test("Asterism server supports keeping multiple speculative branches in parallel and pruning only unkept forks", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "asterism-srv1-"));
  const server = createAsterismServer({
    dbPath: path.join(tmpDir, "test1.sqlite"),
    worktreesDir: path.join(tmpDir, "worktrees"),
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const resetRes = await fetch(`${baseUrl}/api/reset`, { method: "POST" });
    assert.equal(resetRes.status, 200);
    const state = await resetRes.json();
    assert.ok(Array.isArray(state.nodes));
    assert.equal(state.nodes.length, 6);

    // Keep Fork A (without pruning siblings)
    const keepARes = await fetch(`${baseUrl}/api/nodes/commit-branch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodeId: "node-spec-a" }),
    });
    assert.equal(keepARes.status, 200);
    const keepAData = await keepARes.json();
    assert.equal(keepAData.winner.id, "node-spec-a");
    assert.equal(keepAData.winner.status, "committed");
    assert.equal(keepAData.state.nodes.length, 6);

    // Also Keep Fork B in parallel!
    const keepBRes = await fetch(`${baseUrl}/api/nodes/commit-branch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodeId: "node-spec-b" }),
    });
    assert.equal(keepBRes.status, 200);
    const keepBData = await keepBRes.json();
    assert.equal(keepBData.winner.id, "node-spec-b");
    assert.equal(keepBData.winner.status, "committed");
    assert.equal(keepBData.state.nodes.length, 6);

    // Now prune unkept forks -> only Fork C should be discarded, while Fork A and Fork B remain!
    const pruneRes = await fetch(`${baseUrl}/api/nodes/prune-unkept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentId: "node-hydro" }),
    });
    assert.equal(pruneRes.status, 200);
    const pruneData = await pruneRes.json();
    assert.deepEqual(pruneData.discarded, ["node-spec-c"]);
    assert.equal(pruneData.state.nodes.length, 5);

    await fetch(`${baseUrl}/api/reset`, { method: "POST" });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("Features 1-4: Bidirectional Surface State, Arena Models, Multi-Parent Synthesis, and Live Worktree Outbox Implementation + Git Diff/Commit", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "asterism-srv2-"));
  const worktreesDir = path.join(tmpDir, "worktrees");
  const server = createAsterismServer({
    dbPath: path.join(tmpDir, "test2.sqlite"),
    worktreesDir,
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  let createdWorktree = null;

  try {
    await fetch(`${baseUrl}/api/reset`, { method: "POST" });

    // Feature 4: Check /api/providers exposes Arena models and CLI binary probing
    const provRes = await fetch(`${baseUrl}/api/providers`);
    assert.equal(provRes.status, 200);
    const provData = await provRes.json();
    assert.ok(Array.isArray(provData.arenaModels));
    assert.ok(provData.arenaModels.length >= 5);
    assert.ok(provData.providers.some((p) => p.id === "codex" && typeof p.cliInstalled === "boolean"));

    // Feature 3: Bidirectional window.asterism state update & model switch
    const stateRes = await fetch(`${baseUrl}/api/nodes/state`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nodeId: "node-spec-a",
        patch: { cornerRadiusPx: 22, customInteractiveToggle: "enabled" },
        model: "openai/gpt-6-luna",
      }),
    });
    assert.equal(stateRes.status, 200);
    const stateData = await stateRes.json();
    assert.equal(stateData.node.state.cornerRadiusPx, 22);
    assert.equal(stateData.node.state.customInteractiveToggle, "enabled");

    // Feature 2: Multi-Parent Convergence (Synthesize node-spec-a + node-spec-b)
    // Use an unavailable model name to exercise fast deterministic synthesis fallback without waiting on external LLM latency
    const synthRes = await fetch(`${baseUrl}/api/nodes/synthesize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        parentIds: ["node-spec-a", "node-spec-b"],
        instruction: "Combine spatial inspector handles with state timeline scrubbing",
        targetStage: "design",
        model: "offline-fast-synth",
      }),
    });
    assert.equal(synthRes.status, 200);
    const synthData = await synthRes.json();
    const synthNode = synthData.synthNode;
    assert.ok(synthNode.id.startsWith("node-synth-"));
    assert.deepEqual(synthNode.parentIds, ["node-spec-a", "node-spec-b"]);
    // Merged state from both parents!
    assert.equal(synthNode.state.cornerRadiusPx, 22);
    assert.equal(synthNode.state.timelineFps, 60);
    const synthEdges = synthData.state.edges.filter((e) => e.to === synthNode.id);
    assert.equal(synthEdges.length, 2);
    assert.equal(synthEdges[0].kind, "synthesis");

    // Feature 1: Run Outbox Implementation Agent inside isolated Git worktree on the synthesized node
    const implRes = await fetch(`${baseUrl}/api/nodes/implement/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nodeId: synthNode.id,
        instruction: "Generate verified controller for synthesized spatial timeline",
      }),
    });
    assert.equal(implRes.status, 200);
    const implData = await implRes.json();
    createdWorktree = implData.node.worktree;
    assert.ok(createdWorktree?.worktreePath, "Isolated worktree path must be provisioned");
    assert.equal(implData.implementation.testPassed, true, "Generated worktree test suite must pass node --test");
    assert.ok(implData.implementation.diff.insertions > 40, "Git diff must report inserted lines");
    assert.ok(implData.implementation.diff.changedFiles.length >= 4, "Git diff must list generated implementation files");
    assert.ok(implData.implementation.lineageCount >= 3, "Lineage must include synthesized parent chain");

    // Inspect live diff via GET /api/nodes/implement/diff
    const diffRes = await fetch(
      `${baseUrl}/api/nodes/implement/diff?nodeId=${encodeURIComponent(synthNode.id)}`,
    );
    assert.equal(diffRes.status, 200);
    const diffData = await diffRes.json();
    assert.equal(diffData.hasWorktree, true);
    assert.match(diffData.diff.patch, /createSurfaceController/);

    // Feature 1: Commit changes inside the isolated Git worktree branch
    const commitRes = await fetch(`${baseUrl}/api/nodes/implement/commit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nodeId: synthNode.id,
        message: "Commit synthesized implementation from test",
      }),
    });
    assert.equal(commitRes.status, 200);
    const commitData = await commitRes.json();
    assert.equal(commitData.commit.committed, true);
    assert.ok(commitData.commit.commitSha.length >= 6);

    // Multi-Panel Typed Relations: Spawn a companion UI Prototype panel (`visualizes-ui`) from a Dialogue proposal panel (`node-brief`)
    const spawnUiRes = await fetch(`${baseUrl}/api/nodes/spawn-related`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceNodeId: "node-brief",
        relation: "visualizes-ui",
        surfaceRole: "ui-prototype",
        prompt: "Build an interactive sample UI for the feature proposal",
        model: "offline-fast-ui",
      }),
    });
    assert.equal(spawnUiRes.status, 200);
    const spawnUiData = await spawnUiRes.json();
    assert.equal(spawnUiData.childNode.surfaceRole, "ui-prototype");
    assert.equal(spawnUiData.childNode.relationFromParent, "visualizes-ui");
    const relEdge = spawnUiData.state.edges.find(
      (e) => e.from === "node-brief" && e.to === spawnUiData.childNode.id,
    );
    assert.ok(relEdge);
    assert.equal(relEdge.relation, "visualizes-ui");

    // Multi-Panel Agent Collaboration via /api/nodes/mutate: asking a Dialogue panel (`node-brief`, which already has downstream children!)
    // defaults to Regret-Minimizing Branching (`branchedNewFuture: true`) so existing downstream futures stay intact, AND spawns the requested companion `spec-diagram` panel!
    const multiCollabRes = await fetch(`${baseUrl}/api/nodes/mutate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nodeId: "node-brief",
        instruction: "Spawn a separate spec panel for our multi-panel collaboration protocol",
        model: "offline-fast-spec",
      }),
    });
    assert.equal(multiCollabRes.status, 200);
    const multiCollabData = await multiCollabRes.json();
    assert.equal(multiCollabData.branchedNewFuture, true, "Acting on an upstream node with downstream edges must branch a new future by default to minimize regret");
    assert.ok(multiCollabData.branchedRevisionNode.id.startsWith("node-brief-rev"));
    assert.equal(multiCollabData.spawnedPanels.length, 1);
    assert.equal(multiCollabData.spawnedPanels[0].surfaceRole, "spec-diagram");
    assert.equal(multiCollabData.spawnedPanels[0].relationFromParent, "specifies");

    // Crystallization Facet Tab Switch & Tear-Off Lens (`/api/nodes/facet`)
    const facetRes = await fetch(`${baseUrl}/api/nodes/facet`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nodeId: "node-brief",
        facetRole: "spec-diagram",
        tearOff: true,
        prompt: "Crystallize architecture contract lens",
        model: "offline-fast-facet",
      }),
    });
    assert.equal(facetRes.status, 200);
    const facetData = await facetRes.json();
    assert.ok(facetData.tornOffLens.id.startsWith("lens-spec-diagram-"));
    assert.equal(facetData.tornOffLens.lensOfNodeId, "node-brief");
    assert.ok(facetData.node.facets["spec-diagram"]);

    // Basal Free-Energy Floor Allocator (`/api/energy/basal-tick`)
    const energyRes = await fetch(`${baseUrl}/api/energy/basal-tick`, {
      method: "POST",
    });
    assert.equal(energyRes.status, 200);
    const energyData = await energyRes.json();
    assert.ok(energyData.totalGrantedTokens >= 2000, "Basal Free-Energy Floor must allocate excess free energy across nodes");
    assert.ok(energyData.attentionQueue.length >= 6);
    assert.ok(typeof energyData.attentionQueue[0].evoiScore === "number");

    // Ideonomy Tuple Picker (`GET /api/ideonomy/pick?seed=42`)
    const pickRes = await fetch(`${baseUrl}/api/ideonomy/pick?seed=42`);
    assert.equal(pickRes.status, 200);
    const pickData = await pickRes.json();
    assert.equal(pickData.catalog.operatorCount, 8);
    assert.equal(pickData.catalog.organonCount, 17);
    assert.equal(pickData.catalog.dimensionPromptCount, 29);
    assert.equal(pickData.tuple.operatorIds.length, 2);
    assert.equal(pickData.tuple.organonIds.length, 1);
    assert.equal(pickData.tuple.dimensionIds.length, 3);
    assert.ok(pickData.tuple.tupleLabel.includes("×"));

    // Autonomous Idea Box + Shadow Graph + Matchmaker Lateral Jump + EVOI Attention Broker (`/api/ideabox/seed`)
    const seedRes = await fetch(`${baseUrl}/api/ideabox/seed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        seedPrompt: "Cross-pollinate epistemic confidence calibration with isolated Git worktree telemetry",
      }),
    });
    assert.equal(seedRes.status, 200);
    const seedData = await seedRes.json();
    assert.ok(seedData.seedNode.id.startsWith("node-seed-"));
    assert.equal(seedData.seedNode.shadowStaged, false, "Seed node itself is visible on canvas");
    assert.ok(seedData.seedNode.ideonomyTuple, "Seed node must carry its sampled Ideonomy tuple");
    assert.ok(seedData.seedNode.html.includes("IDEONOMY TUPLE"), "Seed node must render visible Ideonomy tuple machinery");
    assert.ok(seedData.seedNode.html.includes("not surfaced:"), "Seed node must render the mandatory not surfaced trail line");
    assert.equal(seedData.shadowBranches.length, 4, "Pipeline must stage 3 Ideonomy branches + 1 Matchmaker hybrid in the Shadow Graph");
    assert.ok(seedData.shadowBranches.every((b) => b.shadowStaged === true), "All 4 generated background branches must be shadowStaged: true initially");
    assert.ok(seedData.shadowBranches.every((b) => b.ideonomyTuple && b.html.includes("IDEONOMY TUPLE") && b.html.includes("not surfaced:")), "Every Ideonomy + Matchmaker shadow branch must carry its Ideonomy tuple and visible machinery");
    assert.ok(seedData.matchedTargetNode, "Matchmaker must discover a distant existing node to cross-pollinate");
    assert.ok(seedData.jumpEdge, "Matchmaker must create a lateral Jump link (cross-pollinates)");
    assert.equal(seedData.jumpEdge.kind, "jump");

    // Verify GET /api/attention/queue ranks items by EVOI and reports shadowCount
    const attnRes = await fetch(`${baseUrl}/api/attention/queue`);
    assert.equal(attnRes.status, 200);
    const attnData = await attnRes.json();
    assert.equal(attnData.shadowCount, 4);
    assert.ok(attnData.queue.length >= 4);
    assert.ok(attnData.queue[0].evoiScore >= attnData.queue[1].evoiScore, "Attention Broker queue must be sorted descending by EVOI");

    // Verify POST /api/attention/auto-resolve (`Hydro.Workflow.Ask` askDefault) resolves & unfolds the top item without blocking
    const autoRes = await fetch(`${baseUrl}/api/attention/auto-resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodeId: seedData.shadowBranches[0].id }),
    });
    assert.equal(autoRes.status, 200);
    const autoData = await autoRes.json();
    assert.equal(autoData.resolvedNode.shadowStaged, false, "Auto-resolving via askDefault promotes the shadow branch onto the canvas");
    assert.equal(autoData.resolvedNode.status, "committed");

    // Verify POST /api/shadow/unfold (`Promote on Receipt`) unfolds remaining shadow children for the seed node
    const unfoldRes = await fetch(`${baseUrl}/api/shadow/unfold`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentNodeId: seedData.seedNode.id }),
    });
    assert.equal(unfoldRes.status, 200);
    const unfoldData = await unfoldRes.json();
    assert.equal(unfoldData.unfoldedNodeIds.length, 3, "Remaining 3 shadow branches for the seed node unfold on receipt");
    assert.equal(unfoldData.attentionBroker.shadowCount, 0, "All shadow branches are now unfolded");

    // Reset back to clean default state
    await fetch(`${baseUrl}/api/reset`, { method: "POST" });
  } finally {
    if (createdWorktree?.worktreePath) {
      await Effect.runPromise(
        removeIsolatedWorktree({
          repoRoot: path.resolve(path.dirname(new URL(import.meta.url).pathname), ".."),
          worktreePath: createdWorktree.worktreePath,
          branchName: createdWorktree.branchName,
        }),
      );
    }
    await new Promise((resolve) => server.close(resolve));
  }
});


