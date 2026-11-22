import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import * as Effect from "effect/Effect";
import { removeIsolatedWorktree } from "@asterism/core";
import { createAsterismServer, resolveOpenCanvasPosition } from "../server.mjs";

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
      body: JSON.stringify({ nodeId: "node-fork-polaris-ux" }),
    });
    assert.equal(keepARes.status, 200);
    const keepAData = await keepARes.json();
    assert.equal(keepAData.winner.id, "node-fork-polaris-ux");
    assert.equal(keepAData.winner.status, "committed");
    assert.equal(keepAData.state.nodes.length, 6);

    // Also Keep Fork B in parallel!
    const keepBRes = await fetch(`${baseUrl}/api/nodes/commit-branch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodeId: "node-fork-feature-tenders" }),
    });
    assert.equal(keepBRes.status, 200);
    const keepBData = await keepBRes.json();
    assert.equal(keepBData.winner.id, "node-fork-feature-tenders");
    assert.equal(keepBData.winner.status, "committed");
    assert.equal(keepBData.state.nodes.length, 6);

    // Now prune unkept forks -> only Fork C should be discarded, while Fork A and Fork B remain!
    const pruneRes = await fetch(`${baseUrl}/api/nodes/prune-unkept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentId: "node-ergodic-algebra" }),
    });
    assert.equal(pruneRes.status, 200);
    const pruneData = await pruneRes.json();
    assert.deepEqual(pruneData.discarded, ["node-fork-ui-critique"]);
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
        nodeId: "node-fork-polaris-ux",
        patch: { railWidthPx: 410, customInteractiveToggle: "enabled" },
        model: "antigravity/gemini-4-neon",
      }),
    });
    assert.equal(stateRes.status, 200);
    const stateData = await stateRes.json();
    assert.equal(stateData.node.state.railWidthPx, 410);
    assert.equal(stateData.node.state.customInteractiveToggle, "enabled");

    // Feature 2: Multi-Parent Convergence (Synthesize node-fork-polaris-ux + node-fork-feature-tenders)
    // Use an unavailable model name to exercise fast deterministic synthesis fallback without waiting on external LLM latency
    const synthRes = await fetch(`${baseUrl}/api/nodes/synthesize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        parentIds: ["node-fork-polaris-ux", "node-fork-feature-tenders"],
        instruction: "Combine peripheral Polaris rail with worktree feature tender promotion",
        targetStage: "design",
        model: "offline-fast-synth",
      }),
    });
    assert.equal(synthRes.status, 200);
    const synthData = await synthRes.json();
    const synthNode = synthData.synthNode;
    assert.ok(synthNode.id.startsWith("node-synth-"));
    assert.deepEqual(synthNode.parentIds, ["node-fork-polaris-ux", "node-fork-feature-tenders"]);
    // Merged state from both parents!
    assert.equal(synthNode.state.railWidthPx, 410);
    assert.equal(synthNode.state.verifyBudgetSec, 45);
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

    // Multi-Panel Typed Relations: Spawn a companion UI Prototype panel (`visualizes-ui`) from a Dialogue proposal panel (`node-asterism-thesis`)
    const spawnUiRes = await fetch(`${baseUrl}/api/nodes/spawn-related`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceNodeId: "node-asterism-thesis",
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
      (e) => e.from === "node-asterism-thesis" && e.to === spawnUiData.childNode.id,
    );
    assert.ok(relEdge);
    assert.equal(relEdge.relation, "visualizes-ui");

    // Multi-Panel Agent Collaboration via /api/nodes/mutate: asking a Dialogue panel (`node-asterism-thesis`, which already has downstream children!)
    // defaults to Regret-Minimizing Branching (`branchedNewFuture: true`) so existing downstream futures stay intact, AND spawns the requested companion `spec-diagram` panel!
    const multiCollabRes = await fetch(`${baseUrl}/api/nodes/mutate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nodeId: "node-asterism-thesis",
        instruction: "Spawn a separate spec panel for our multi-panel collaboration protocol",
        model: "offline-fast-spec",
      }),
    });
    assert.equal(multiCollabRes.status, 200);
    const multiCollabData = await multiCollabRes.json();
    assert.equal(multiCollabData.branchedNewFuture, true, "Acting on an upstream node with downstream edges must branch a new future by default to minimize regret");
    assert.ok(multiCollabData.branchedRevisionNode.id.startsWith("node-asterism-thesis-rev"));
    assert.equal(multiCollabData.spawnedPanels.length, 1);
    assert.equal(multiCollabData.spawnedPanels[0].surfaceRole, "spec-diagram");
    assert.equal(multiCollabData.spawnedPanels[0].relationFromParent, "specifies");

    // Crystallization Facet Tab Switch & Tear-Off Lens (`/api/nodes/facet`)
    const facetRes = await fetch(`${baseUrl}/api/nodes/facet`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nodeId: "node-asterism-thesis",
        facetRole: "spec-diagram",
        tearOff: true,
        prompt: "Crystallize architecture contract lens",
        model: "offline-fast-facet",
      }),
    });
    assert.equal(facetRes.status, 200);
    const facetData = await facetRes.json();
    assert.ok(facetData.tornOffLens.id.startsWith("lens-spec-diagram-"));
    assert.equal(facetData.tornOffLens.lensOfNodeId, "node-asterism-thesis");
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

    // Verify T3-style Global Workspace Projects (`GET /api/projects` & `POST /api/projects`)
    const projRes = await fetch(`${baseUrl}/api/projects`);
    assert.equal(projRes.status, 200);
    const projData = await projRes.json();
    assert.equal(projData.activeProjectId, "proj-misc-attic", "Default project must be the 'anything goes' misc repo so development never blocks");
    assert.equal(projData.activeProject.isDefaultMisc, true);
    assert.ok(projData.projects.length >= 2);

    const switchProjRes = await fetch(`${baseUrl}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activeProjectId: "proj-asterism" }),
    });
    assert.equal(switchProjRes.status, 200);
    const switchProjData = await switchProjRes.json();
    assert.equal(switchProjData.activeProjectId, "proj-asterism");

    // Verify TheBrain-style Plex Focus & Multi-View Projection (`POST /api/views/plex`)
    const plexRes = await fetch(`${baseUrl}/api/views/plex`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        focusNodeId: "node-ergodic-algebra",
        viewProjection: "plex",
        applyLayout: true,
      }),
    });
    assert.equal(plexRes.status, 200);
    const plexData = await plexRes.json();
    assert.equal(plexData.viewProjection, "plex");
    assert.equal(plexData.focusNodeId, "node-ergodic-algebra");
    assert.ok(plexData.parents.some((p) => p.id === "node-asterism-thesis"), "Plex must identify node-asterism-thesis as parent of node-ergodic-algebra");
    assert.ok(plexData.children.some((c) => c.id === "node-fork-polaris-ux"), "Plex must identify node-fork-polaris-ux as child of node-ergodic-algebra");
    assert.ok(plexData.lateral.some((l) => l.id === "node-t3-self-host"), "Plex must identify node-t3-self-host as lateral peer of node-ergodic-algebra");

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

test("Sovereign Compute: Power-Set Policy (Co-Fork, Neither, Ask/Probe) & Testable UserModel Brier Calibration", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "asterism-sovereign-"));
  const server = createAsterismServer({
    dbPath: path.join(tmpDir, "sovereign.sqlite"),
    worktreesDir: path.join(tmpDir, "worktrees"),
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await fetch(`${baseUrl}/api/reset`, { method: "POST" });

    // 1. Complementary ergodic experiments within Basal Free-Energy Floor -> Silent Co-Fork ("Both")
    const coforkRes = await fetch(`${baseUrl}/api/decisions/compile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "Compare optimizer schedule A and data curriculum B in ergodic worktrees",
        projectId: "proj-misc-attic",
        model: "offline-deterministic",
      }),
    });
    assert.equal(coforkRes.status, 200);
    const coforkData = await coforkRes.json();
    assert.equal(coforkData.regime, "co-fork", "Ergodic complementary experiments within basal energy must co-fork both paths automatically");
    assert.equal(coforkData.materializedNodes.length, 2);
    assert.equal(coforkData.sealedPrediction.predictedSubsetKey, "opt-a+opt-b");

    // 2. Negative-utility trap ("$1k cat food vs $1k dog food") -> Status-Quo ∅ ("abstain-neither")
    const neitherRes = await fetch(`${baseUrl}/api/decisions/compile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "Decide between buying $1k cat food or $1k dog food",
        projectId: "proj-misc-attic",
        model: "offline-deterministic",
      }),
    });
    assert.equal(neitherRes.status, 200);
    const neitherData = await neitherRes.json();
    assert.equal(neitherData.regime, "abstain-neither", "Negative-utility options must resolve to ∅ (neither) rather than forcing a bad choice");
    assert.equal(neitherData.materializedNodes.length, 0);
    assert.equal(neitherData.sealedPrediction.predictedSubsetKey, "∅");

    // 3. Calibration Spot-Check Probe -> Seals prediction first, renders unanchored {Both, A, B, Neither} surface, then scores Brier on click
    const probeRes = await fetch(`${baseUrl}/api/decisions/compile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "Spot-check co-fork preference on reversible UI layout variants",
        projectId: "proj-misc-attic",
        forceProbe: true,
        model: "offline-deterministic",
      }),
    });
    assert.equal(probeRes.status, 200);
    const probeData = await probeRes.json();
    assert.equal(probeData.regime, "probe-calibration");
    assert.ok(probeData.decisionNode, "Calibration probe must surface a compiled decision card");
    assert.ok(!probeData.decisionNode.html.includes("Pre-predicted"), "Decision card must not leak pre-prediction before user clicks (no anchoring)");
    assert.ok(probeData.decisionNode.html.includes("✦ Both"), "Non-exclusive decision card must offer Both to avoid false-dichotomy label corruption");
    assert.ok(probeData.decisionNode.html.includes("∅ Neither"), "Decision card must offer Neither baseline");

    const resolveRes = await fetch(`${baseUrl}/api/decisions/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nodeId: probeData.decisionNode.id,
        predictionId: probeData.sealedPrediction.id,
        chosenOptionIds: ["opt-a", "opt-b"],
      }),
    });
    assert.equal(resolveRes.status, 200);
    const resolveData = await resolveRes.json();
    assert.equal(resolveData.resolvedPrediction.chosenSubsetKey, "opt-a+opt-b");
    assert.equal(typeof resolveData.resolvedPrediction.brierScore, "number");
    assert.equal(resolveData.resolvedPrediction.accurate, true);
    assert.equal(resolveData.spawnedNodes.length, 2, "Choosing Both materializes both branches");

    const coforkHyp = resolveData.userModel.hypotheses.find((h) => h.id === "hyp-cofork-basal");
    assert.equal(coforkHyp.usesSinceLastProbe, 0, "Resolving a probe resets staleness counter on tested hypotheses");
    assert.equal(coforkHyp.empiricalTrials, 1, "Default hypotheses start at 0 empirical trials and increment honestly on probe resolution");

    await fetch(`${baseUrl}/api/reset`, { method: "POST" });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});




test('Surprise additions: counterfactual receipts, passive preferences, tidy and morning briefing', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asterism-surprises-'));
  const server = createAsterismServer({ dbPath: path.join(dir, 'events.sqlite'), stateFile: path.join(dir, 'state.json'), worktreesDir: path.join(dir, 'worktrees') });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = async (route, body = {}, status = 200) => {
    const res = await fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json(); assert.equal(res.status, status, JSON.stringify(data)); return data;
  };
  const overlaps = (a, b) => a.x < b.x + (b.width || 400) && a.x + (a.width || 400) > b.x && a.y < b.y + (b.height || 260) && a.y + (a.height || 260) > b.y;
  try {
    await post('/api/reset');
    await post('/api/user-model/observe', { type: 'invalid' }, 400);
    for (const type of ['counterfactual-override', 'co-fork-upgrade', 'branch-pruned', 'tearoff-promoted']) {
      const observed = await post('/api/user-model/observe', { type });
      assert.equal(observed.affectedHypothesis.source, 'inferred');
      const id = observed.affectedHypothesis.id;
      const pinned = await post('/api/user-model/hypotheses', { hypothesisId: id, action: 'pin' });
      assert.ok(pinned.userModel.hypotheses.find(h => h.id === id).confidence >= 0.85);
      assert.equal(pinned.userModel.hypotheses.find(h => h.id === id).pinned, true);
      const dismissed = await post('/api/user-model/hypotheses', { hypothesisId: id, action: 'dismiss' });
      assert.equal(dismissed.userModel.hypotheses.find(h => h.id === id).status, 'refuted');
    }
    // Reset priors so the deterministic compiler chooses its basal co-fork.
    await post('/api/reset');
    const compiled = await post('/api/decisions/compile', { prompt: 'Compare optimizer schedule A and data curriculum B in ergodic worktrees', projectId: 'proj-misc-attic', model: 'offline-deterministic', x: 25, y: 25 });
    assert.equal(compiled.materializedNodes.length, 2);
    for (const n of compiled.materializedNodes) for (const other of compiled.state.nodes.filter(o => o.id !== n.id && !o.shadowStaged)) assert.equal(overlaps(n, other), false);
    const node = compiled.materializedNodes[0], predictionId = compiled.sealedPrediction.id;
    assert.ok(node.html.includes('data-counterfactual-bar="1"'));
    assert.equal(node.autonomousReceipt.candidates.length, 2);
    const otherId = node.autonomousReceipt.candidates.find(c => c.id !== node.autonomousReceipt.candidateId).id;
    await post('/api/decisions/counterfactual', { nodeId: node.id, predictionId, targetOptionIds: ['bogus'] }, 400);
    await post('/api/decisions/counterfactual', { predictionId: 'missing' }, 404);
    const swapped = await post('/api/decisions/counterfactual', { nodeId: node.id, predictionId, targetOptionIds: [otherId] });
    assert.equal(swapped.materializedNodes[0].autonomousReceipt.candidateId, otherId);
    assert.equal(swapped.resolvedPrediction.accurate, false);
    assert.ok(Number.isFinite(swapped.resolvedPrediction.brierScore));
    assert.ok(swapped.materializedNodes[0].html.includes('✦ Keep Both'));
    assert.ok(swapped.userModel.hypotheses.some(h => h.id === 'hyp-inferred-counterfactual-autonomy'));
    const both = await post('/api/decisions/counterfactual', { nodeId: node.id, action: 'keep-both' });
    assert.equal(both.resolvedPrediction.chosenOptionIds.length, 2);
    assert.ok(both.userModel.hypotheses.some(h => h.id === 'hyp-inferred-cofork-expansion'));
    const briefing = await (await fetch(base + '/api/views/briefing')).json();
    assert.ok(Array.isArray(briefing.needsYourCall)); assert.ok(briefing.autonomousAndBasalMoves.some(n => n.predictionId === predictionId && n.canSwapCounterfactual));
    assert.equal(briefing.modelShifts.resolvedCount, 1); assert.ok(briefing.modelShifts.inferredHypotheses.length >= 2);
    const neither = await post('/api/decisions/counterfactual', { nodeId: node.id, action: 'neither' });
    assert.ok(neither.removedNodeIds.includes(node.id)); assert.deepEqual(neither.resolvedPrediction.chosenOptionIds, []);
    assert.ok(neither.state.edges.every(e => !neither.removedNodeIds.includes(e.from) && !neither.removedNodeIds.includes(e.to)));
    const seeded = await post('/api/ideabox/seed', { prompt: 'Ambient counterfactual lenses', model: 'offline-deterministic', x: 25, y: 25 });
    for (const n of seeded.state.nodes.filter(n => !n.shadowStaged && n.id !== seeded.seedNode.id)) assert.equal(overlaps(n, seeded.seedNode), false);
    const pending = await (await fetch(base + '/api/views/briefing')).json();
    assert.ok(pending.needsYourCall.some(n => n.regime === 'shadow-staged'));
    const unfolded = await post('/api/shadow/unfold', { parentNodeId: seeded.seedNode.id });
    assert.ok(unfolded.unfoldedIds.length > 0);
    for (const id of unfolded.unfoldedIds) {
      const n = unfolded.state.nodes.find(n => n.id === id);
      for (const other of unfolded.state.nodes.filter(o => o.id !== id && !o.shadowStaged)) assert.equal(overlaps(n, other), false);
    }
    // Explicit movements can overlap; tidy must restore collision-free order.
    const ids = neither.state.nodes.slice(0, 3).map(n => n.id);
    for (const nodeId of ids) await post('/api/nodes/move', { nodeId, x: 25, y: 25 });
    const tidy = await post('/api/canvas/tidy');
    assert.ok(tidy.movedCount > 0);
    const visible = tidy.nodes.filter(n => !n.shadowStaged);
    for (let i = 0; i < visible.length; i++) for (let j = i + 1; j < visible.length; j++) assert.equal(overlaps(visible[i], visible[j]), false, `${visible[i].id} overlaps ${visible[j].id}`);
  } finally { await new Promise(resolve => server.close(resolve)); fs.rmSync(dir, { recursive: true, force: true }); }
});


test('Open canvas placement respects dimensions, exclusions and shadow staging', () => {
  const nodes = [{ id: 'occupied', x: 25, y: 25, width: 700, height: 500 }];
  const pos = resolveOpenCanvasPosition(nodes, 25, 25, 395, 260);
  assert.ok(pos.x >= 753 || pos.y >= 553);
  assert.deepEqual(resolveOpenCanvasPosition(nodes, 25, 25, 395, 260, 28, new Set(['occupied'])), { x: 25, y: 25 });
  assert.deepEqual(resolveOpenCanvasPosition([{ ...nodes[0], shadowStaged: true }], 25, 25), { x: 25, y: 25 });
});

test('Self-hosting infra: /api/health, /api/nodes/update, SSE server_hello + polaris_update, and Polaris Workspace Steward', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asterism-polaris-'));
  let capturedTurn = null;
  const server = createAsterismServer({
    dbPath: path.join(tmpDir, 'polaris.sqlite'),
    stateFile: path.join(tmpDir, 'state.json'),
    worktreesDir: path.join(tmpDir, 'worktrees'),
    polarisStateFile: path.join(tmpDir, 'polaris.json'),
    polarisRunner: async (turn) => {
      capturedTurn = turn;
      return {
        threadId: 'thread-polaris-test-1',
        threadLink: 'http://127.0.0.1:3773/threads/thread-polaris-test-1',
        text: `Polaris inspected "${turn.focusedNode?.title || 'none'}" via ${turn.polaris.providerInstanceId}/${turn.polaris.model}.`,
      };
    },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const sseAbort = new AbortController();

  try {
    // 1. Verify /api/health exposes bootId, gitSha, indexHtmlHash, and Polaris default model
    const healthRes = await fetch(`${baseUrl}/api/health?deep=1`);
    assert.equal(healthRes.status, 200);
    const health = await healthRes.json();
    assert.equal(health.ok, true);
    assert.ok(typeof health.bootId === 'string' && health.bootId.length >= 8);
    assert.ok(typeof health.indexHtmlHash === 'string' && health.indexHtmlHash.length >= 8);
    assert.equal(health.polaris.providerInstanceId, 'antigravity');
    assert.equal(health.polaris.model, 'gemini-4-neon');

    // 2. Open SSE stream and confirm initial server_hello, state, and polaris_update frames
    const sseRes = await fetch(`${baseUrl}/api/events`, { signal: sseAbort.signal });
    assert.equal(sseRes.status, 200);
    const reader = sseRes.body.getReader();
    const decoder = new TextDecoder();
    let sseBuffer = '';
    while (
      (!sseBuffer.includes('event: server_hello') ||
        !sseBuffer.includes('event: state') ||
        !sseBuffer.includes('event: polaris_update')) &&
      sseBuffer.length < 500_000
    ) {
      const { value, done } = await reader.read();
      if (done) break;
      sseBuffer += decoder.decode(value, { stream: true });
    }
    assert.match(sseBuffer, /event: server_hello/);
    assert.match(sseBuffer, /event: polaris_update/);
    sseAbort.abort();

    // 3. Create a linked child card and update it via /api/nodes/update (CLI / Polaris manipulation contract)
    const createRes = await fetch(`${baseUrl}/api/nodes/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        node: { id: 'node-polaris-probe', title: 'Polaris Probe Card', stage: 'spec', summary: 'Initial summary' },
        parentNodeId: 'node-ergodic-algebra',
        relation: 'advances',
      }),
    });
    assert.equal(createRes.status, 200);
    const created = await createRes.json();
    assert.equal(created.node.parentId, 'node-ergodic-algebra');
    assert.ok(created.state.edges.some((e) => e.from === 'node-ergodic-algebra' && e.to === 'node-polaris-probe'));

    const updateRes = await fetch(`${baseUrl}/api/nodes/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nodeId: 'node-polaris-probe',
        title: 'Polaris Updated Card',
        state: { stewardVerified: true },
      }),
    });
    assert.equal(updateRes.status, 200);
    const updated = await updateRes.json();
    assert.equal(updated.node.title, 'Polaris Updated Card');
    assert.equal(updated.node.state.stewardVerified, true);

    // 4. Send a message to Polaris with focusedNodeId and verify prompt injection + turn completion
    const msgRes = await fetch(`${baseUrl}/api/polaris/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Review the focused card and summarize next steps.',
        focusedNodeId: 'node-polaris-probe',
        wait: true,
      }),
    });
    assert.equal(msgRes.status, 200);
    const msgData = await msgRes.json();
    assert.equal(msgData.ok, true);
    assert.equal(msgData.polaris.status, 'idle');
    assert.equal(msgData.polaris.threadId, 'thread-polaris-test-1');
    assert.equal(msgData.polaris.messages.length, 2);
    assert.match(msgData.polaris.messages[1].text, /Polaris Updated Card/);
    assert.ok(capturedTurn.fullPrompt.includes('<polaris_role>'), 'First turn must inject Polaris role system prompt');
    assert.ok(capturedTurn.fullPrompt.includes('bin/asterism self-check'), 'Prompt must document self-check / self-deploy CLI');
    assert.ok(capturedTurn.fullPrompt.includes('Polaris Updated Card'), 'Prompt must inject focused card context');

    // 5. Configure model & reset thread cleanly
    const cfgRes = await fetch(`${baseUrl}/api/polaris/configure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerInstanceId: 'muse', model: 'muse-wonder-full-1.0' }),
    });
    assert.equal(cfgRes.status, 200);
    const cfgData = await cfgRes.json();
    assert.equal(cfgData.polaris.providerInstanceId, 'muse');
    assert.equal(cfgData.polaris.model, 'muse-wonder-full-1.0');
    assert.equal(cfgData.polaris.threadId, 'thread-polaris-test-1', 'Configuring model preserves thread continuity when supported');

    const rstRes = await fetch(`${baseUrl}/api/polaris/reset`, { method: 'POST' });
    assert.equal(rstRes.status, 200);
    const rstData = await rstRes.json();
    assert.equal(rstData.polaris.threadId, null);
    assert.equal(rstData.polaris.messages.length, 0);
  } finally {
    sseAbort.abort();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

