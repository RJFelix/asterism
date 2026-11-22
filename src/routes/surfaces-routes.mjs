import fs from "node:fs";
import path from "node:path";
import * as Effect from "effect/Effect";
import {
  createIsolatedWorktree,
  inspectWorktreeDiff,
  commitWorktreeChanges,
  createDefaultEnergyEnvelope,
  attenuateEnergyForBranches,
  normalizeWarrant,
  shouldBranchForRegretMinimization,
  recordBehavioralObservation,
} from "@asterism/core";
import {
  DEFAULT_MODEL,
  SURFACE_ROLES,
  PANEL_RELATIONS,
  defaultRoleForStage,
  mutateHtmlSurface,
  collaborateAcrossPanels,
  spawnRelatedPanel,
  generateSpeculativeBranches,
  synthesizeNodes,
  advanceNodeStage,
  pickIdeonomyTuple,
} from "../llm.mjs";
import {
  collectNeighborhoodNodes,
  resolveOpenCanvasPosition,
} from "../canvas-state.mjs";
import { readJsonBody, requestErrorStatus, sendJson } from "../http-helpers.mjs";

export function resolveNodeGitRepoRoot(canvasState, node, defaultRepoRoot) {
  const targetProjectId = node?.projectId || canvasState.activeProjectId;
  const project =
    (canvasState.projects || []).find((p) => p.id === targetProjectId) ||
    (canvasState.projects || []).find((p) => p.id === canvasState.activeProjectId);
  if (
    project?.repoPath &&
    fs.existsSync(project.repoPath) &&
    fs.existsSync(path.join(project.repoPath, ".git"))
  ) {
    return project.repoPath;
  }
  return defaultRepoRoot;
}

export async function handleSurfacesRoutes(req, res, url, ctx) {
  const {
    repoRoot,
    worktreesDir,
    peerFederation,
    getCanvasState,
    saveCanvasState,
    broadcastState,
    recordDomainCommand,
    drainOutbox,
  } = ctx;

  // Multi-Panel Aware Mutation with Regret-Minimizing Branching (`/api/nodes/mutate`)
  if (req.method === "POST" && url.pathname === "/api/nodes/mutate") {
    try {
      const canvasState = getCanvasState();
      const {
        nodeId,
        instruction,
        selectedSelector,
        model,
        surfaceRole,
        editIntent = "auto-branch",
        commandId,
      } = await readJsonBody(req);
      const node = canvasState.nodes.find((n) => n.id === nodeId);
      if (!node) return (sendJson(res, 404, { error: "Node not found" }), true);

      const targetRole =
        surfaceRole && SURFACE_ROLES[surfaceRole]
          ? surfaceRole
          : node.surfaceRole || defaultRoleForStage(node.stage);
      const targetModel = model || node.model || DEFAULT_MODEL;

      const branchNewFuture = shouldBranchForRegretMinimization({
        nodeId: node.id,
        edges: canvasState.edges || [],
        editIntent,
      });

      node.status = "mutating";
      broadcastState();

      const neighborhood = collectNeighborhoodNodes(canvasState, node.id);
      const mutationTuple = pickIdeonomyTuple({ mode: "rich" });

      let updatedHtml;
      let spawnedPanels = [];
      let activeIdeonomyTuple = {
        operatorIds: mutationTuple.operatorIds,
        organonIds: mutationTuple.organonIds,
        dimensionIds: mutationTuple.dimensionIds,
        tupleLabel: mutationTuple.tupleLabel,
      };
      if (selectedSelector) {
        updatedHtml = await mutateHtmlSurface({
          currentHtml: node.facets?.[targetRole] || node.html,
          title: node.title,
          surfaceRole: targetRole,
          instruction,
          selectedSelector,
          model: targetModel,
          nodeState: node.state,
          neighborhood,
          ideonomyTuple: mutationTuple,
        });
      } else {
        const collab = await collaborateAcrossPanels({
          sourceNode: {
            ...node,
            surfaceRole: targetRole,
            html: node.facets?.[targetRole] || node.html,
          },
          instruction,
          neighborhood,
          model: targetModel,
        });
        updatedHtml = collab.updatedHtml;
        spawnedPanels = collab.spawnedPanels || [];
        if (collab.ideonomyTuple) {
          activeIdeonomyTuple = collab.ideonomyTuple;
        }
      }

      node.status = "ready";
      let targetNode = node;
      let branchedRevisionNode = null;

      if (branchNewFuture) {
        const siblingRevs = canvasState.edges.filter(
          (e) => e.from === node.id && e.relation === "revisions-from",
        ).length;
        const revNum = (node.revision || 1) + siblingRevs + 1;
        branchedRevisionNode = {
          ...JSON.parse(JSON.stringify(node)),
          id: `${node.id}-rev${revNum}-${Date.now().toString(36).slice(-4)}`,
          title: `${node.title} (v${revNum})`,
          parentId: node.id,
          revision: revNum,
          surfaceRole: targetRole,
          model: targetModel,
          x: node.x + 40,
          y: node.y + node.height + 55 + siblingRevs * 110,
          status: "ready",
          commitment: "speculative",
          html: updatedHtml,
          ideonomyTuple: activeIdeonomyTuple,
          facets: {
            ...(node.facets || {
              [node.surfaceRole || defaultRoleForStage(node.stage)]: node.html,
            }),
            [targetRole]: updatedHtml,
          },
          energy: createDefaultEnergyEnvelope(node.energy),
        };
        if (!branchedRevisionNode.shadowStaged) {
          Object.assign(
            branchedRevisionNode,
            resolveOpenCanvasPosition(
              canvasState.nodes,
              branchedRevisionNode.x,
              branchedRevisionNode.y,
              branchedRevisionNode.width,
              branchedRevisionNode.height,
            ),
          );
        }
        canvasState.nodes.push(branchedRevisionNode);
        canvasState.edges.push({
          id: `edge-rev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          from: node.id,
          to: branchedRevisionNode.id,
          relation: "revisions-from",
          kind: "revisions-from",
          label: `🌱 branches v${revNum} (existing future preserved)`,
        });
        targetNode = branchedRevisionNode;
      } else {
        const prevRev = node.revision || 1;
        node.revisions = Array.isArray(node.revisions) ? node.revisions : [];
        node.revisions.push({
          revision: prevRev,
          timestamp: new Date().toISOString(),
          title: node.title,
          html: node.html,
          state: { ...(node.state || {}) },
          instruction,
        });
        node.revision = prevRev + 1;
        node.model = targetModel;
        node.surfaceRole = targetRole;
        node.ideonomyTuple = activeIdeonomyTuple;
        node.facets = {
          ...(node.facets || {}),
          [targetRole]: updatedHtml,
        };
        node.html = updatedHtml;

        for (const edge of canvasState.edges || []) {
          if (edge.from === node.id) {
            const child = canvasState.nodes.find((n) => n.id === edge.to);
            if (child) {
              child.upstreamRevisionAvailable = node.revision;
            }
          }
        }
      }

      for (const sp of spawnedPanels) {
        const relMeta =
          PANEL_RELATIONS[sp.relationFromParent] ||
          PANEL_RELATIONS["visualizes-ui"];
        if (!sp.shadowStaged) {
          Object.assign(
            sp,
            resolveOpenCanvasPosition(
              canvasState.nodes,
              sp.x,
              sp.y,
              sp.width,
              sp.height,
            ),
          );
        }
        canvasState.nodes.push(sp);
        canvasState.edges.push({
          id: `edge-rel-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          from: targetNode.id,
          to: sp.id,
          relation: sp.relationFromParent,
          kind: sp.relationFromParent,
          label: relMeta.label,
        });
      }

      saveCanvasState(canvasState);

      await recordDomainCommand(
        "node.mutate",
        targetNode.id,
        branchNewFuture ? "surface.branched.regret_free" : "surface.mutated",
        {
          sourceNodeId: node.id,
          targetNodeId: targetNode.id,
          branchedNewFuture: branchNewFuture,
          instruction,
          model: targetNode.model,
          surfaceRole: targetNode.surfaceRole,
          ideonomyTuple: targetNode.ideonomyTuple,
          spawnedPanelIds: spawnedPanels.map((p) => p.id),
        },
        [{ request: { type: "surface.mutate", nodeId: targetNode.id, instruction } }],
        commandId,
      );

      broadcastState();
      return (
        sendJson(res, 200, {
          node: targetNode,
          branchedNewFuture: branchNewFuture,
          branchedRevisionNode,
          spawnedPanels,
          ideonomyTuple: targetNode.ideonomyTuple,
          state: canvasState,
        }),
        true
      );
    } catch (err) {
      return (sendJson(res, requestErrorStatus(err), { error: err.message }), true);
    }
  }

  // Crystallization Facet Tab Switch & Tear-Off Lens (`/api/nodes/facet`)
  if (req.method === "POST" && url.pathname === "/api/nodes/facet") {
    try {
      const canvasState = getCanvasState();
      const {
        nodeId,
        facetRole = "spec-diagram",
        tearOff = false,
        prompt,
        model,
        commandId,
      } = await readJsonBody(req);
      const node = canvasState.nodes.find((n) => n.id === nodeId);
      if (!node) return (sendJson(res, 404, { error: "Node not found" }), true);

      const currentRole = node.surfaceRole || defaultRoleForStage(node.stage);
      node.facets = node.facets || { [currentRole]: node.html };

      const relationMap = {
        "ui-prototype": "visualizes-ui",
        "spec-diagram": "specifies",
        "artifact-harness": "implements",
        dialogue: "annotates",
      };
      const relation = relationMap[facetRole] || "specifies";

      if (!node.facets[facetRole] || prompt) {
        node.status = "mutating";
        broadcastState();
        const neighborhood = collectNeighborhoodNodes(canvasState, node.id);
        const generated = await spawnRelatedPanel({
          sourceNode: node,
          relation,
          surfaceRole: facetRole,
          title: node.title,
          prompt:
            prompt ||
            `Crystallize the "${facetRole}" facet lens for thought "${node.title}"`,
          neighborhood,
          existingRelatedCount: 0,
          model: model || node.model || DEFAULT_MODEL,
        });
        node.facets[facetRole] = generated.html;
        node.status = "ready";
      }

      if (tearOff) {
        const existingOut = canvasState.edges.filter(
          (e) => e.from === node.id,
        ).length;
        const tornOffLens = {
          id: `lens-${facetRole}-${Date.now().toString(36)}`,
          title: `${node.title} [${SURFACE_ROLES[facetRole]?.shortBadge || facetRole}]`,
          kind: "lens",
          lensOfNodeId: node.id,
          stage: node.stage,
          surfaceRole: facetRole,
          projectId: node.projectId || canvasState.activeProjectId,
          x: node.x + node.width + 65,
          y: node.y + existingOut * 120,
          width: 410,
          height: 350,
          model: node.model || DEFAULT_MODEL,
          status: "ready",
          state: node.state || {},
          facets: { ...node.facets },
          html: node.facets[facetRole],
          energy: createDefaultEnergyEnvelope(node.energy),
        };
        if (!tornOffLens.shadowStaged) {
          Object.assign(
            tornOffLens,
            resolveOpenCanvasPosition(
              canvasState.nodes,
              tornOffLens.x,
              tornOffLens.y,
              tornOffLens.width,
              tornOffLens.height,
            ),
          );
        }
        canvasState.userModel = recordBehavioralObservation(canvasState.userModel, {
          type: "tearoff-promoted",
          projectId: canvasState.activeProjectId,
          nodeId: node.id,
        }).updatedUserModel;
        canvasState.nodes.push(tornOffLens);
        canvasState.edges.push({
          id: `edge-lens-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          from: node.id,
          to: tornOffLens.id,
          relation,
          kind: "lens",
          label: `🔭 lens (${facetRole})`,
        });
        saveCanvasState(canvasState);
        await recordDomainCommand(
          "node.facet.tearoff",
          node.id,
          "facet.torn_off",
          { nodeId: node.id, lensNodeId: tornOffLens.id, facetRole },
          [],
          commandId,
        );
        broadcastState();
        return (
          sendJson(res, 200, {
            node,
            tornOffLens,
            facetRole,
            state: canvasState,
          }),
          true
        );
      }

      node.surfaceRole = facetRole;
      node.html = node.facets[facetRole];
      saveCanvasState(canvasState);
      await recordDomainCommand(
        "node.facet.switch",
        node.id,
        "facet.switched",
        { nodeId: node.id, facetRole },
        [],
        commandId,
      );
      broadcastState();
      return (sendJson(res, 200, { node, facetRole, state: canvasState }), true);
    } catch (err) {
      return (sendJson(res, requestErrorStatus(err), { error: err.message }), true);
    }
  }

  // Spawn a Related Companion Panel (`/api/nodes/spawn-related`)
  if (req.method === "POST" && url.pathname === "/api/nodes/spawn-related") {
    try {
      const canvasState = getCanvasState();
      const {
        sourceNodeId,
        relation = "visualizes-ui",
        surfaceRole,
        title,
        prompt,
        model,
        commandId,
      } = await readJsonBody(req);

      const sourceNode = canvasState.nodes.find((n) => n.id === sourceNodeId);
      if (!sourceNode) {
        return (sendJson(res, 404, { error: "Source node not found" }), true);
      }

      sourceNode.status = "mutating";
      broadcastState();

      const neighborhood = collectNeighborhoodNodes(canvasState, sourceNode.id);
      const existingRelatedCount = canvasState.edges.filter(
        (e) => e.from === sourceNode.id,
      ).length;

      const childNode = await spawnRelatedPanel({
        sourceNode,
        relation,
        surfaceRole,
        title,
        prompt,
        neighborhood,
        existingRelatedCount,
        model: model || sourceNode.model || DEFAULT_MODEL,
      });

      sourceNode.status = "ready";
      childNode.projectId = sourceNode.projectId || canvasState.activeProjectId;
      const relMeta =
        PANEL_RELATIONS[childNode.relationFromParent] ||
        PANEL_RELATIONS["visualizes-ui"];

      if (!childNode.shadowStaged) {
        Object.assign(
          childNode,
          resolveOpenCanvasPosition(
            canvasState.nodes,
            childNode.x,
            childNode.y,
            childNode.width,
            childNode.height,
          ),
        );
      }

      canvasState.nodes.push(childNode);
      canvasState.edges.push({
        id: `edge-rel-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        from: sourceNode.id,
        to: childNode.id,
        relation: childNode.relationFromParent,
        kind: childNode.relationFromParent,
        label: relMeta.label,
      });

      const outboxEffects = [
        {
          request: {
            type: "panel.spawn-related",
            sourceNodeId: sourceNode.id,
            childNodeId: childNode.id,
            relation: childNode.relationFromParent,
            surfaceRole: childNode.surfaceRole,
            ...(prompt ? { prompt } : {}),
          },
        },
      ];

      if (childNode.surfaceRole === "artifact-harness" || childNode.stage === "implement") {
        try {
          const targetRepoRoot = resolveNodeGitRepoRoot(canvasState, childNode, repoRoot);
          const wt = await Effect.runPromise(
            createIsolatedWorktree({
              repoRoot: targetRepoRoot,
              worktreesDir,
              nodeId: childNode.id,
            }),
          );
          childNode.worktree = wt;
          outboxEffects.push({
            request: {
              type: "harness.run-turn",
              nodeId: childNode.id,
              provider: childNode.provider || "codex",
              model: childNode.model || DEFAULT_MODEL,
              prompt:
                prompt ||
                `Implement and verify ${childNode.title} inside isolated worktree`,
              cwd: wt.worktreePath,
            },
          });
        } catch {
          // Ignore worktree error if git is unavailable
        }
      }

      saveCanvasState(canvasState);
      await recordDomainCommand(
        "panel.spawn-related",
        sourceNode.id,
        "panel.related.spawned",
        {
          sourceNodeId: sourceNode.id,
          childNodeId: childNode.id,
          relation: childNode.relationFromParent,
          surfaceRole: childNode.surfaceRole,
        },
        outboxEffects,
        commandId,
      );

      await drainOutbox();
      broadcastState();

      return (sendJson(res, 200, { childNode, state: canvasState }), true);
    } catch (err) {
      return (sendJson(res, requestErrorStatus(err), { error: err.message }), true);
    }
  }

  // Multi-Provider / Multi-Model Arena Forking (`/api/nodes/speculate`)
  if (req.method === "POST" && url.pathname === "/api/nodes/speculate") {
    try {
      const canvasState = getCanvasState();
      const {
        nodeId,
        prompt,
        count = 3,
        arenaMode = true,
        surfaceRole,
        models,
        commandId,
      } = await readJsonBody(req);
      const sourceNode = canvasState.nodes.find((n) => n.id === nodeId);
      if (!sourceNode) {
        return (sendJson(res, 404, { error: "Source node not found" }), true);
      }

      sourceNode.status = "speculating";
      broadcastState();

      const neighborhood = collectNeighborhoodNodes(canvasState, sourceNode.id);
      const branches = await generateSpeculativeBranches({
        sourceNode,
        prompt,
        count,
        arenaMode,
        surfaceRole,
        models,
        neighborhood,
      });

      const parentEnergy = sourceNode.energy || createDefaultEnergyEnvelope();
      const childEnergy = attenuateEnergyForBranches(
        parentEnergy,
        branches.length || count,
      );
      sourceNode.energy = {
        ...parentEnergy,
        remainingTokens: Math.max(
          400,
          parentEnergy.remainingTokens - 300 * branches.length,
        ),
      };

      sourceNode.status = "ready";
      for (const b of branches) {
        b.commitment = "speculative";
        b.projectId = sourceNode.projectId || canvasState.activeProjectId;
        b.warrant = normalizeWarrant(b).warrant;
        b.energy = childEnergy;
        b.facets = { [b.surfaceRole || defaultRoleForStage(b.stage)]: b.html };
        if (!b.shadowStaged) {
          Object.assign(
            b,
            resolveOpenCanvasPosition(
              canvasState.nodes,
              b.x,
              b.y,
              b.width,
              b.height,
            ),
          );
        }
        canvasState.nodes.push(b);
        const shortModel = (b.model || "").replace(/^openai\//, "");
        canvasState.edges.push({
          id: `edge-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          from: sourceNode.id,
          to: b.id,
          relation: "forks",
          kind: arenaMode ? "arena" : "speculative",
          label: arenaMode
            ? `⚔ forks (${shortModel} • p=${b.jevScore})`
            : `${b.branchTag} (p=${b.jevScore})`,
        });
      }

      saveCanvasState(canvasState);
      await recordDomainCommand(
        "node.speculate",
        sourceNode.id,
        "branches.forked",
        {
          sourceNodeId: sourceNode.id,
          arenaMode,
          branchIds: branches.map((b) => b.id),
          models: branches.map((b) => b.model),
        },
        [
          {
            request: {
              type: "surface.speculate",
              nodeId: sourceNode.id,
              prompt: prompt || "Arena Speculate",
              count,
            },
          },
        ],
        commandId,
      );
      broadcastState();
      return (sendJson(res, 200, { branches, state: canvasState }), true);
    } catch (err) {
      return (sendJson(res, requestErrorStatus(err), { error: err.message }), true);
    }
  }

  // Multi-Parent Convergence (`/api/nodes/synthesize`)
  if (req.method === "POST" && url.pathname === "/api/nodes/synthesize") {
    try {
      const canvasState = getCanvasState();
      const {
        parentIds = [],
        instruction,
        targetStage,
        surfaceRole,
        model,
        commandId,
      } = await readJsonBody(req);

      const uniqueParentIds = [...new Set(parentIds)];
      const parentNodes = uniqueParentIds
        .map((id) => canvasState.nodes.find((n) => n.id === id))
        .filter(Boolean);

      if (parentNodes.length < 2) {
        return (
          sendJson(res, 400, {
            error: "At least 2 parent nodes are required to synthesize a merged branch",
          }),
          true
        );
      }

      broadcastState();

      const synthNode = await synthesizeNodes({
        parentNodes,
        instruction,
        targetStage,
        surfaceRole,
        model: model || parentNodes[0]?.model || DEFAULT_MODEL,
      });
      synthNode.commitment = "speculative";
      synthNode.projectId =
        parentNodes[0]?.projectId || canvasState.activeProjectId;
      synthNode.warrant = normalizeWarrant(synthNode).warrant;
      synthNode.energy = createDefaultEnergyEnvelope();
      synthNode.facets = {
        [synthNode.surfaceRole || defaultRoleForStage(synthNode.stage)]:
          synthNode.html,
      };

      if (!synthNode.shadowStaged) {
        Object.assign(
          synthNode,
          resolveOpenCanvasPosition(
            canvasState.nodes,
            synthNode.x,
            synthNode.y,
            synthNode.width,
            synthNode.height,
          ),
        );
      }

      canvasState.nodes.push(synthNode);
      for (const p of parentNodes) {
        canvasState.edges.push({
          id: `edge-synth-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          from: p.id,
          to: synthNode.id,
          relation: "synthesizes",
          kind: "synthesis",
          label: `⊕ synthesizes (${p.surfaceRole || p.stage})`,
        });
      }

      saveCanvasState(canvasState);
      await recordDomainCommand(
        "node.synthesize",
        synthNode.id,
        "branches.synthesized",
        {
          synthNodeId: synthNode.id,
          parentIds: parentNodes.map((p) => p.id),
          stage: synthNode.stage,
          surfaceRole: synthNode.surfaceRole,
        },
        [
          {
            request: {
              type: "surface.synthesize",
              nodeId: synthNode.id,
              parentIds: parentNodes.map((p) => p.id),
              targetStage: synthNode.stage,
              ...(instruction ? { instruction } : {}),
            },
          },
        ],
        commandId,
      );
      broadcastState();
      return (sendJson(res, 200, { synthNode, state: canvasState }), true);
    } catch (err) {
      return (sendJson(res, requestErrorStatus(err), { error: err.message }), true);
    }
  }

  if (req.method === "POST" && url.pathname === "/api/nodes/commit-branch") {
    try {
      const canvasState = getCanvasState();
      const { nodeId, pruneSiblings = false, commandId } = await readJsonBody(req);
      const winner = canvasState.nodes.find((n) => n.id === nodeId);
      if (!winner) {
        return (sendJson(res, 404, { error: "Branch node not found" }), true);
      }

      winner.status = "committed";
      winner.commitment = "committed";
      winner.kind = "surface";

      let discarded = [];
      if (pruneSiblings && winner.parentId) {
        const siblingIds = new Set(
          canvasState.nodes
            .filter(
              (n) =>
                n.parentId === winner.parentId &&
                n.id !== winner.id &&
                n.status !== "committed",
            )
            .map((n) => n.id),
        );
        discarded = [...siblingIds];
        canvasState.nodes = canvasState.nodes.filter((n) => !siblingIds.has(n.id));
        canvasState.edges = canvasState.edges.filter(
          (e) => !siblingIds.has(e.from) && !siblingIds.has(e.to),
        );
      }

      saveCanvasState(canvasState);
      await recordDomainCommand(
        "branch.keep",
        winner.id,
        "branch.committed",
        { winnerId: winner.id, discarded },
        [],
        commandId,
      );
      broadcastState();
      return (sendJson(res, 200, { winner, discarded, state: canvasState }), true);
    } catch (err) {
      return (sendJson(res, requestErrorStatus(err), { error: err.message }), true);
    }
  }

  if (req.method === "POST" && url.pathname === "/api/nodes/prune-unkept") {
    try {
      const canvasState = getCanvasState();
      const { parentId, commandId } = await readJsonBody(req);
      const unkeptIds = new Set(
        canvasState.nodes
          .filter(
            (n) =>
              (!parentId || n.parentId === parentId) &&
              n.kind === "speculative" &&
              n.status !== "committed",
          )
          .map((n) => n.id),
      );
      if (unkeptIds.size > 0) {
        canvasState.userModel = recordBehavioralObservation(canvasState.userModel, {
          type: "branch-pruned",
          projectId: canvasState.activeProjectId,
        }).updatedUserModel;
      }
      canvasState.nodes = canvasState.nodes.filter((n) => !unkeptIds.has(n.id));
      canvasState.edges = canvasState.edges.filter(
        (e) => !unkeptIds.has(e.from) && !unkeptIds.has(e.to),
      );
      saveCanvasState(canvasState);
      await recordDomainCommand(
        "branch.prune-unkept",
        parentId || "canvas-root",
        "branches.pruned",
        { discarded: [...unkeptIds] },
        [],
        commandId,
      );
      broadcastState();
      return (
        sendJson(res, 200, {
          discarded: [...unkeptIds],
          state: canvasState,
        }),
        true
      );
    } catch (err) {
      return (sendJson(res, requestErrorStatus(err), { error: err.message }), true);
    }
  }

  if (req.method === "POST" && url.pathname === "/api/nodes/advance") {
    try {
      const canvasState = getCanvasState();
      const { nodeId, targetStage, surfaceRole, instruction, commandId } =
        await readJsonBody(req);
      const sourceNode = canvasState.nodes.find((n) => n.id === nodeId);
      if (!sourceNode) {
        return (sendJson(res, 404, { error: "Source node not found" }), true);
      }

      if (sourceNode.kind === "speculative") {
        sourceNode.status = "committed";
        sourceNode.kind = "surface";
      }
      sourceNode.status = "mutating";
      broadcastState();

      const neighborhood = collectNeighborhoodNodes(canvasState, sourceNode.id);
      const childNode = await advanceNodeStage({
        sourceNode,
        targetStage,
        surfaceRole,
        instruction,
        neighborhood,
      });

      const existingDownstream = canvasState.edges.filter(
        (e) => e.from === sourceNode.id,
      ).length;
      childNode.y = sourceNode.y + existingDownstream * 140;
      childNode.projectId = sourceNode.projectId || canvasState.activeProjectId;

      sourceNode.status = "committed";
      const relMeta =
        PANEL_RELATIONS[childNode.relationFromParent] || PANEL_RELATIONS.advances;
      if (!childNode.shadowStaged) {
        Object.assign(
          childNode,
          resolveOpenCanvasPosition(
            canvasState.nodes,
            childNode.x,
            childNode.y,
            childNode.width,
            childNode.height,
          ),
        );
      }
      canvasState.nodes.push(childNode);
      canvasState.edges.push({
        id: `edge-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        from: sourceNode.id,
        to: childNode.id,
        relation: childNode.relationFromParent || "advances",
        kind: childNode.relationFromParent || "advances",
        label: `${relMeta.label} (${childNode.stage})`,
      });

      const outboxEffects = [
        {
          request: {
            type: "train.advance",
            nodeId: sourceNode.id,
            targetStage: childNode.stage,
            ...(instruction ? { instruction } : {}),
          },
        },
      ];

      if (childNode.stage === "implement") {
        try {
          const targetRepoRoot = resolveNodeGitRepoRoot(canvasState, childNode, repoRoot);
          const wt = await Effect.runPromise(
            createIsolatedWorktree({
              repoRoot: targetRepoRoot,
              worktreesDir,
              nodeId: childNode.id,
            }),
          );
          childNode.worktree = wt;
          outboxEffects.push({
            request: {
              type: "harness.run-turn",
              nodeId: childNode.id,
              provider: childNode.provider || "codex",
              model: childNode.model || DEFAULT_MODEL,
              prompt:
                instruction ||
                `Implement and verify ${childNode.title} inside isolated worktree`,
              cwd: wt.worktreePath,
            },
          });
        } catch {
          // Ignore worktree error if git is unavailable
        }
      }

      saveCanvasState(canvasState);
      await recordDomainCommand(
        "train.advance",
        sourceNode.id,
        "node.advanced",
        {
          sourceNodeId: sourceNode.id,
          childNodeId: childNode.id,
          stage: childNode.stage,
          surfaceRole: childNode.surfaceRole,
          worktree: childNode.worktree ?? null,
        },
        outboxEffects,
        commandId,
      );

      await drainOutbox();
      broadcastState();
      return (
        sendJson(res, 200, {
          childNode,
          state: canvasState,
          peerFederationReady: Boolean(peerFederation),
        }),
        true
      );
    } catch (err) {
      return (sendJson(res, requestErrorStatus(err), { error: err.message }), true);
    }
  }

  // Live Git Diff & Verification Status for an IMPLEMENT Node (`/api/nodes/implement/diff`)
  if (req.method === "GET" && url.pathname === "/api/nodes/implement/diff") {
    try {
      const canvasState = getCanvasState();
      const nodeId = url.searchParams.get("nodeId");
      const node = canvasState.nodes.find((n) => n.id === nodeId);
      if (!node) return (sendJson(res, 404, { error: "Node not found" }), true);

      if (!node.worktree?.worktreePath) {
        return (
          sendJson(res, 200, {
            nodeId: node.id,
            hasWorktree: false,
            implementation: node.implementation || null,
          }),
          true
        );
      }

      const diff = await Effect.runPromise(
        inspectWorktreeDiff(node.worktree.worktreePath),
      );
      if (node.implementation) {
        node.implementation.diff = diff;
      }
      return (
        sendJson(res, 200, {
          nodeId: node.id,
          hasWorktree: true,
          worktree: node.worktree,
          diff,
          implementation: node.implementation || null,
        }),
        true
      );
    } catch (err) {
      return (sendJson(res, requestErrorStatus(err), { error: err.message }), true);
    }
  }

  // Trigger or Re-Run Outbox Agent Inside an IMPLEMENT Node's Git Worktree (`/api/nodes/implement/run`)
  if (req.method === "POST" && url.pathname === "/api/nodes/implement/run") {
    try {
      const canvasState = getCanvasState();
      const { nodeId, instruction, provider, model, commandId } =
        await readJsonBody(req);
      const node = canvasState.nodes.find((n) => n.id === nodeId);
      if (!node) return (sendJson(res, 404, { error: "Node not found" }), true);

      node.stage = "implement";
      node.surfaceRole = "artifact-harness";
      if (model) node.model = model;
      if (provider) node.provider = provider;

      const activeProject =
        (canvasState.projects || []).find(
          (p) => p.id === (node.projectId || canvasState.activeProjectId),
        ) || (canvasState.projects || [])[0];
      node.projectId = activeProject?.id || "proj-misc-attic";
      const targetRepoRoot = resolveNodeGitRepoRoot(canvasState, node, repoRoot);

      if (!node.worktree?.worktreePath) {
        node.worktree = await Effect.runPromise(
          createIsolatedWorktree({
            repoRoot: targetRepoRoot,
            worktreesDir,
            nodeId: node.id,
          }),
        );
      }

      await recordDomainCommand(
        "implement.run",
        node.id,
        "implement.turn.enqueued",
        {
          nodeId: node.id,
          worktreePath: node.worktree.worktreePath,
          instruction: instruction || "Run worktree implementation & verification",
        },
        [
          {
            request: {
              type: "harness.run-turn",
              nodeId: node.id,
              provider: node.provider || "codex",
              model: node.model || DEFAULT_MODEL,
              prompt:
                instruction ||
                `Implement and verify ${node.title} inside isolated worktree`,
              cwd: node.worktree.worktreePath,
            },
          },
        ],
        commandId,
      );

      await drainOutbox();
      return (
        sendJson(res, 200, {
          node,
          implementation: node.implementation,
          state: canvasState,
        }),
        true
      );
    } catch (err) {
      return (sendJson(res, requestErrorStatus(err), { error: err.message }), true);
    }
  }

  // Commit Generated Implementation Inside Isolated Git Worktree (`/api/nodes/implement/commit`)
  if (req.method === "POST" && url.pathname === "/api/nodes/implement/commit") {
    try {
      const canvasState = getCanvasState();
      const { nodeId, message, commandId } = await readJsonBody(req);
      const node = canvasState.nodes.find((n) => n.id === nodeId);
      if (!node) return (sendJson(res, 404, { error: "Node not found" }), true);
      if (!node.worktree?.worktreePath) {
        return (
          sendJson(res, 400, { error: "Node has no provisioned Git worktree" }),
          true
        );
      }

      const commitMessage =
        message ||
        `Implement ${node.title} (${node.id}) via Asterism Innovation Train`;

      const commitResult = await Effect.runPromise(
        commitWorktreeChanges({
          worktreePath: node.worktree.worktreePath,
          message: commitMessage,
        }),
      );

      node.worktree.headCommit = commitResult.commitSha;
      node.worktree.lastCommitMessage = commitResult.message;
      if (node.implementation) {
        node.implementation.lastCommit = commitResult;
        node.implementation.diff = await Effect.runPromise(
          inspectWorktreeDiff(node.worktree.worktreePath),
        );
      }

      saveCanvasState(canvasState);
      await recordDomainCommand(
        "implement.commit",
        node.id,
        "worktree.committed",
        {
          nodeId: node.id,
          ...commitResult,
        },
        [
          {
            request: {
              type: "worktree.commit",
              nodeId: node.id,
              worktreePath: node.worktree.worktreePath,
              message: commitMessage,
            },
          },
        ],
        commandId,
      );
      await drainOutbox();
      broadcastState();

      return (
        sendJson(res, 200, {
          commit: commitResult,
          node,
          state: canvasState,
        }),
        true
      );
    } catch (err) {
      return (sendJson(res, requestErrorStatus(err), { error: err.message }), true);
    }
  }

  return false;
}
