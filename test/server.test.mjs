import test from "node:test";
import assert from "node:assert/strict";
import { createAsterismServer } from "../server.mjs";

test("Asterism server supports keeping multiple speculative branches in parallel and pruning only unkept forks", async () => {
  const server = createAsterismServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // Reset to clean state
    const resetRes = await fetch(`${baseUrl}/api/reset`, { method: "POST" });
    assert.equal(resetRes.status, 200);
    const state = await resetRes.json();
    assert.ok(Array.isArray(state.nodes));
    assert.equal(state.nodes.length, 6);

    // Keep Fork A (without pruning siblings)
    const keepARes = await fetch(`${baseUrl}/api/nodes/commit-branch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodeId: "node-spec-a" })
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
      body: JSON.stringify({ nodeId: "node-spec-b" })
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
      body: JSON.stringify({ parentId: "node-hydro" })
    });
    assert.equal(pruneRes.status, 200);
    const pruneData = await pruneRes.json();
    assert.deepEqual(pruneData.discarded, ["node-spec-c"]);
    assert.equal(pruneData.state.nodes.length, 5);

    // Reset back so default demo state has all 3 speculative branches ready
    await fetch(`${baseUrl}/api/reset`, { method: "POST" });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
