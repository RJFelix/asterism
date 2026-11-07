import test from "node:test";
import assert from "node:assert/strict";
import { createAsterismServer } from "../server.mjs";

test("Asterism server serves initial spatial canvas state and commits speculative branches", async () => {
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

    // Commit Fork A and verify siblings Fork B & Fork C are pruned
    const commitRes = await fetch(`${baseUrl}/api/nodes/commit-branch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodeId: "node-spec-a" })
    });
    assert.equal(commitRes.status, 200);
    const commitData = await commitRes.json();
    assert.equal(commitData.winner.id, "node-spec-a");
    assert.equal(commitData.winner.status, "committed");
    assert.deepEqual(commitData.discarded.sort(), ["node-spec-b", "node-spec-c"]);
    assert.equal(commitData.state.nodes.length, 4);

    // Reset back so default demo state has all 3 speculative branches ready
    await fetch(`${baseUrl}/api/reset`, { method: "POST" });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
