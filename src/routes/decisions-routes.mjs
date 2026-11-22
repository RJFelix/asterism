import crypto from "node:crypto";
import {
  createDefaultEnergyEnvelope,
  attenuateEnergyForBranches,
  normalizeWarrant,
  computeAttentionBid,
  allocateBasalFreeEnergy,
  rankMatchmakerCandidates,
  createDefaultUserModel,
  evaluatePowerSetPolicy,
  recordAutonomousActionOnUserModel,
  scoreSealedPrediction,
  recordBehavioralObservation,
  computeEmpiricalCalibrationFactor,
} from "@asterism/core";
import {
  DEFAULT_MODEL,
  defaultRoleForStage,
  runIdeonomyAndMatchmakerPipeline,
  pickIdeonomyTuple,
  getIdeonomyCatalogSummary,
  renderIdeonomyMachineryHtml,
  compileDecisionTreeOnTheFly,
  renderCompiledDecisionSurfaceHtml,
  renderAutonomousBranchHtml,
} from "../llm.mjs";
import { resolveOpenCanvasPosition } from "../canvas-state.mjs";
import {
  escapeHtml,
  readJsonBody,
  requestErrorStatus,
  sendJson,
} from "../http-helpers.mjs";

export function computeAttentionBrokerSnapshot(canvasState) {
  for (const n of canvasState.nodes) {
    if (!n.energy) n.energy = createDefaultEnergyEnvelope();
    const w = normalizeWarrant(n);
    n.warrant = w.warrant;
    const downstreamCount = (canvasState.edges || []).filter(
      (e) => e.from === n.id,
    ).length;
    n.attentionBid = computeAttentionBid({
      warrant: n.warrant,
      jevScore: n.jevScore,
      downstreamCount,
      opticMode:
        n.surfaceRole === "ui-prototype"
          ? "exhibit"
          : n.surfaceRole === "dialogue"
            ? "steer"
            : "observe",
    });
    n.evoiScore = n.attentionBid.evoiScore;
  }

  const shadowNodes = canvasState.nodes.filter((n) => n.shadowStaged);
  const shadowByParent = {};
  for (const sn of shadowNodes) {
    const pid = sn.parentId || "root";
    if (!shadowByParent[pid]) {
      shadowByParent[pid] = {
        parentId: pid,
        count: 0,
        synthesisCount: 0,
        nodeIds: [],
      };
    }
    shadowByParent[pid].count += 1;
    if (sn.stance === "matchmaker" || sn.relationFromParent === "synthesizes") {
      shadowByParent[pid].synthesisCount += 1;
    }
    shadowByParent[pid].nodeIds.push(sn.id);
  }

  const queue = canvasState.nodes
    .filter((n) => n.shadowStaged || n.commitment === "speculative")
    .sort((a, b) => (b.attentionBid?.evoiScore || 0) - (a.attentionBid?.evoiScore || 0))
    .map((n) => ({
      nodeId: n.id,
      parentId: n.parentId || null,
      title: n.title,
      stance: n.stance || "explorer",
      surfaceRole: n.surfaceRole || defaultRoleForStage(n.stage),
      shadowStaged: Boolean(n.shadowStaged),
      askDefault:
        n.kind === "decision" ? null : n.askDefault || "Keep & Promote to Active Canvas",
      requiresExplicitResolution: n.kind === "decision",
      evoiScore: n.attentionBid?.evoiScore ?? 0,
      epistemicEntropy: n.attentionBid?.epistemicEntropy ?? 0,
      pass: n.attentionBid?.pass ?? 0.5,
      abstain: n.attentionBid?.abstain ?? 0.2,
      estimatedHumanSeconds: n.attentionBid?.estimatedHumanSeconds ?? 15,
      remainingTokens: n.energy?.remainingTokens ?? 3600,
    }));

  return {
    shadowCount: shadowNodes.length,
    shadowByParent,
    queue,
  };
}

export async function handleDecisionsRoutes(req, res, url, ctx) {
  const {
    getCanvasState,
    saveCanvasState,
    broadcastState,
    recordDomainCommand,
  } = ctx;

  if (req.method === "POST" && url.pathname === "/api/user-model/observe") {
    try {
      const body = await readJsonBody(req);
      if (
        ![
          "counterfactual-override",
          "co-fork-upgrade",
          "branch-pruned",
          "tearoff-promoted",
        ].includes(body.type)
      ) {
        return (sendJson(res, 400, { error: "Invalid behavioral event type" }), true);
      }
      const canvasState = getCanvasState();
      const result = recordBehavioralObservation(canvasState.userModel, body);
      canvasState.userModel = result.updatedUserModel;
      saveCanvasState(canvasState);
      broadcastState();
      return (
        sendJson(res, 200, {
          affectedHypothesis: result.affectedHypothesis,
          userModel: canvasState.userModel,
          calibration: computeEmpiricalCalibrationFactor(
            canvasState.userModel.hypotheses,
          ),
          state: canvasState,
        }),
        true
      );
    } catch (err) {
      return (sendJson(res, requestErrorStatus(err), { error: err.message }), true);
    }
  }

  if (req.method === "POST" && url.pathname === "/api/decisions/counterfactual") {
    try {
      const {
        nodeId,
        predictionId,
        action = "swap",
        targetOptionIds,
        commandId,
      } = await readJsonBody(req);
      if (!["swap", "keep-both", "neither"].includes(action)) {
        return (sendJson(res, 400, { error: "Invalid counterfactual action" }), true);
      }
      const canvasState = getCanvasState();
      const node = nodeId
        ? canvasState.nodes.find((n) => n.id === nodeId)
        : canvasState.nodes.find(
            (n) => n.autonomousReceipt?.predictionId === predictionId,
          );
      const pred = canvasState.userModel.sealedPredictions.find(
        (p) => p.id === (predictionId || node?.autonomousReceipt?.predictionId),
      );
      if (!pred || (node && node.autonomousReceipt?.predictionId !== pred.id)) {
        return (
          sendJson(res, 404, { error: "Autonomous prediction not found" }),
          true
        );
      }
      const candidates = node?.autonomousReceipt?.candidates || [];
      const prompt = node?.autonomousReceipt?.prompt || pred.prompt || "";
      const effectiveOptionIds =
        action === "neither"
          ? []
          : action === "keep-both"
            ? candidates.map((c) => c.id)
            : Array.isArray(targetOptionIds) && targetOptionIds.length
              ? targetOptionIds
              : candidates
                  .filter((c) => c.id !== node?.autonomousReceipt?.candidateId)
                  .map((c) => c.id)
                  .slice(0, 1);
      if (
        action !== "neither" &&
        (!node ||
          !effectiveOptionIds.length ||
          (action === "swap" && effectiveOptionIds.length !== 1) ||
          effectiveOptionIds.some((id) => !candidates.some((c) => c.id === id)))
      ) {
        return (sendJson(res, 400, { error: "Invalid counterfactual target" }), true);
      }
      const scored = scoreSealedPrediction({
        userModel: canvasState.userModel,
        predictionId: pred.id,
        chosenOptionIds: effectiveOptionIds,
        allowOverride: true,
      });
      const materializedNodes = [];
      const removedNodeIds = [];
      const render = (n, cand, regimeLabel) => {
        n.title = cand.label;
        n.autonomousReceipt = {
          ...n.autonomousReceipt,
          candidateId: cand.id,
          chosenOptionIds: effectiveOptionIds,
          regime: action === "swap" ? "counterfactual-swap" : "co-fork",
          reachability: cand.reachability,
        };
        n.html = renderAutonomousBranchHtml({
          candidate: cand,
          prompt,
          ideonomyTuple: n.ideonomyTuple,
          regimeLabel,
          nodeId: n.id,
          predictionId: pred.id,
          candidates,
          chosenOptionIds: effectiveOptionIds,
        });
        n.facets = { ...n.facets, "ui-prototype": n.html };
        materializedNodes.push(n);
      };
      if (action === "neither") {
        for (const n of canvasState.nodes) {
          if (n.autonomousReceipt?.predictionId === pred.id || n.id === nodeId) {
            removedNodeIds.push(n.id);
          }
        }
        const ids = new Set(removedNodeIds);
        canvasState.nodes = canvasState.nodes.filter((n) => !ids.has(n.id));
        canvasState.edges = canvasState.edges.filter(
          (e) => !ids.has(e.from) && !ids.has(e.to),
        );
      } else if (action === "swap") {
        render(
          node,
          candidates.find((c) => c.id === effectiveOptionIds[0]),
          "↺ Counterfactual Swap",
        );
      } else {
        candidates.forEach((cand, i) => {
          let sibling = canvasState.nodes.find(
            (n) =>
              n.autonomousReceipt?.predictionId === pred.id &&
              n.autonomousReceipt?.candidateId === cand.id,
          );
          if (!sibling) {
            sibling = {
              ...node,
              id: `node-auto-${crypto.randomUUID()}`,
              ...resolveOpenCanvasPosition(
                canvasState.nodes,
                node.x + 425,
                node.y,
                395,
                260,
              ),
              width: 395,
              height: 260,
            };
            canvasState.nodes.push(sibling);
            if (node.parentId) {
              canvasState.edges.push({
                id: `edge-auto-${crypto.randomUUID()}`,
                from: node.parentId,
                to: sibling.id,
                relation: "forks",
                kind: "forks",
              });
            }
          }
          render(sibling, cand, `✦ Co-Forked (${i + 1}/${candidates.length})`);
        });
      }
      canvasState.userModel = recordBehavioralObservation(scored.updatedUserModel, {
        type:
          action === "keep-both"
            ? "co-fork-upgrade"
            : action === "neither"
              ? "branch-pruned"
              : "counterfactual-override",
        projectId: pred.projectId || canvasState.activeProjectId,
        nodeId: node?.id,
      }).updatedUserModel;
      saveCanvasState(canvasState);
      await recordDomainCommand(
        "decision.counterfactual",
        nodeId || pred.id,
        "decision.overridden",
        { action, predictionId: pred.id, effectiveOptionIds },
        [],
        commandId,
      );
      broadcastState();
      return (
        sendJson(res, 200, {
          action,
          resolvedPrediction: scored.resolvedPrediction,
          materializedNodes,
          removedNodeIds,
          userModel: canvasState.userModel,
          calibration: computeEmpiricalCalibrationFactor(
            canvasState.userModel.hypotheses,
          ),
          state: canvasState,
        }),
        true
      );
    } catch (err) {
      return (
        sendJson(
          res,
          ["INVALID_CHOICE", "INFEASIBLE_SUBSET"].includes(err.code)
            ? 400
            : requestErrorStatus(err),
          { error: err.message },
        ),
        true
      );
    }
  }

  if (req.method === "GET" && url.pathname === "/api/user-model") {
    const canvasState = getCanvasState();
    canvasState.userModel = canvasState.userModel || createDefaultUserModel();
    const calibration = computeEmpiricalCalibrationFactor(
      canvasState.userModel.hypotheses,
    );
    return (
      sendJson(res, 200, {
        userModel: canvasState.userModel,
        calibration,
      }),
      true
    );
  }

  if (req.method === "POST" && url.pathname === "/api/user-model/hypotheses") {
    try {
      const canvasState = getCanvasState();
      canvasState.userModel = canvasState.userModel || createDefaultUserModel();
      const body = await readJsonBody(req);
      const now = new Date().toISOString();
      let hypotheses = [...canvasState.userModel.hypotheses];

      if (body.hypothesisId && !hypotheses.some((h) => h.id === body.hypothesisId)) {
        return (sendJson(res, 404, { error: "Hypothesis not found" }), true);
      }
      if (body.hypothesisId) {
        hypotheses = hypotheses.map((h) => {
          if (h.id !== body.hypothesisId) return h;
          return {
            ...h,
            ...(typeof body.statement === "string"
              ? { statement: body.statement.trim() }
              : {}),
            ...(body.status === "active" || body.status === "refuted"
              ? { status: body.status }
              : {}),
            ...(body.polarity === "positive" || body.polarity === "negative"
              ? { polarity: body.polarity }
              : {}),
            ...(Number.isFinite(body.weight)
              ? { weight: Math.max(-1, Math.min(1, body.weight)) }
              : {}),
            ...(Number.isFinite(body.confidence)
              ? { confidence: Math.max(0, Math.min(1, body.confidence)) }
              : {}),
            ...(typeof body.pinned === "boolean" ? { pinned: body.pinned } : {}),
            ...(body.action === "pin"
              ? {
                  pinned: true,
                  status: "active",
                  confidence: Number(Math.max(h.confidence, 0.85).toFixed(3)),
                }
              : {}),
            ...(body.action === "dismiss" ? { status: "refuted", pinned: false } : {}),
            updatedAt: now,
          };
        });
      } else if (typeof body.statement === "string" && body.statement.trim()) {
        hypotheses.unshift({
          source: "explicit",
          pinned: true,
          id: `hyp-${Date.now().toString(36)}`,
          statement: body.statement.trim(),
          scopeProjectId: body.scopeProjectId || "global",
          polarity: body.polarity === "negative" ? "negative" : "positive",
          weight: Number.isFinite(body.weight)
            ? Math.max(-1, Math.min(1, body.weight))
            : 0.75,
          confidence: Number.isFinite(body.confidence)
            ? Math.max(0, Math.min(1, body.confidence))
            : 0.65,
          empiricalHits: 0,
          empiricalTrials: 0,
          brierSum: 0,
          usesSinceLastProbe: 3,
          status: "active",
          updatedAt: now,
        });
      }

      canvasState.userModel = {
        ...canvasState.userModel,
        hypotheses,
      };
      saveCanvasState(canvasState);
      broadcastState();
      return (
        sendJson(res, 200, {
          userModel: canvasState.userModel,
          calibration: computeEmpiricalCalibrationFactor(hypotheses),
          state: canvasState,
        }),
        true
      );
    } catch (err) {
      return (sendJson(res, requestErrorStatus(err), { error: err.message }), true);
    }
  }

  if (req.method === "POST" && url.pathname === "/api/decisions/compile") {
    try {
      const canvasState = getCanvasState();
      canvasState.userModel = canvasState.userModel || createDefaultUserModel();
      const body = await readJsonBody(req);
      if (
        body.parentNodeId &&
        !canvasState.nodes.some((n) => n.id === body.parentNodeId)
      ) {
        return (sendJson(res, 404, { error: "Parent node not found" }), true);
      }
      const prompt =
        String(body.prompt || "").trim() ||
        "Explore two complementary directions for ambient zero-chrome UI";
      const projectId =
        body.projectId || canvasState.activeProjectId || "proj-misc-attic";
      const altitudeScale =
        typeof body.attentionalAltitudeScale === "number"
          ? body.attentionalAltitudeScale
          : canvasState.viewport?.scale || 0.88;
      const baseX = Number.isFinite(body.x) ? body.x : 520;
      const baseY = Number.isFinite(body.y) ? body.y : 380;

      const compiled = await compileDecisionTreeOnTheFly({
        prompt,
        userModel: canvasState.userModel,
        projectId,
        model: body.model || DEFAULT_MODEL,
      });

      const decisionNodeId = `node-dec-${Date.now().toString(36)}`;
      const policy = evaluatePowerSetPolicy({
        prompt,
        candidates: compiled.candidates,
        userModel: canvasState.userModel,
        projectId,
        attentionalAltitudeScale: altitudeScale,
        nodeId: decisionNodeId,
      });

      const effectiveRegime = body.forceProbe ? "probe-calibration" : policy.regime;

      const sealedPrediction = {
        ...policy.sealedPrediction,
        regime: effectiveRegime,
      };

      const materializedNodes = [];
      let decisionNode = null;

      if (
        effectiveRegime === "ask-regret" ||
        effectiveRegime === "probe-calibration"
      ) {
        const hasMutualExclusion = compiled.candidates.some(
          (c) =>
            Array.isArray(c.mutuallyExclusiveWith) &&
            c.mutuallyExclusiveWith.length > 0,
        );
        const html = renderCompiledDecisionSurfaceHtml({
          nodeId: decisionNodeId,
          prompt,
          candidates: compiled.candidates,
          predictionId: sealedPrediction.id,
          allowBoth: !hasMutualExclusion,
        });
        decisionNode = {
          id: decisionNodeId,
          title: prompt.slice(0, 56),
          kind: "decision",
          stage: "refine",
          surfaceRole: "dialogue",
          commitment: "speculative",
          status: "ready",
          projectId,
          x: baseX,
          y: baseY,
          width: 440,
          height: 270,
          model: body.model || DEFAULT_MODEL,
          parentId: body.parentNodeId || undefined,
          decisionMeta: {
            predictionId: sealedPrediction.id,
            regime: effectiveRegime,
            prompt,
            candidates: compiled.candidates,
            resolved: false,
          },
          facets: { dialogue: html },
          html,
          energy: createDefaultEnergyEnvelope(),
        };
        if (!decisionNode.shadowStaged) {
          Object.assign(
            decisionNode,
            resolveOpenCanvasPosition(
              canvasState.nodes,
              decisionNode.x,
              decisionNode.y,
              decisionNode.width,
              decisionNode.height,
            ),
          );
        }
        canvasState.nodes.push(decisionNode);
        if (body.parentNodeId) {
          canvasState.edges.push({
            id: `edge-dec-${Date.now().toString(36)}`,
            from: body.parentNodeId,
            to: decisionNode.id,
            relation: "advances",
            kind: "advances",
            label: "elicits decision",
          });
        }
        canvasState.userModel = {
          ...canvasState.userModel,
          sealedPredictions: [
            sealedPrediction,
            ...canvasState.userModel.sealedPredictions,
          ].slice(0, 60),
        };
      } else {
        const chosenSet = new Set(policy.bestSubset.optionIds);
        const chosenCandidates = compiled.candidates.filter((c) =>
          chosenSet.has(c.id),
        );
        chosenCandidates.forEach((cand, idx) => {
          const branchId = `node-auto-${Date.now().toString(36)}-${idx}`;
          const regimeLabel =
            effectiveRegime === "co-fork"
              ? `✦ Co-Forked (${idx + 1}/${chosenCandidates.length})`
              : "⚡ Auto-Committed";
          const html = renderAutonomousBranchHtml({
            candidate: cand,
            prompt,
            ideonomyTuple: compiled.ideonomyTuple,
            regimeLabel,
            nodeId: branchId,
            predictionId: sealedPrediction.id,
            candidates: compiled.candidates,
            chosenOptionIds: policy.bestSubset.optionIds,
          });
          const branchNode = {
            id: branchId,
            title: cand.label,
            kind: "surface",
            stage: "design",
            surfaceRole: "ui-prototype",
            commitment: "committed",
            status: "committed",
            projectId,
            x: baseX + idx * 425,
            y: baseY,
            width: 395,
            height: 260,
            model: body.model || DEFAULT_MODEL,
            parentId: body.parentNodeId || undefined,
            ideonomyTuple: {
              operatorIds: compiled.ideonomyTuple.operatorIds,
              organonIds: compiled.ideonomyTuple.organonIds,
              dimensionIds: compiled.ideonomyTuple.dimensionIds,
              tupleLabel: compiled.ideonomyTuple.tupleLabel,
            },
            autonomousReceipt: {
              predictionId: sealedPrediction.id,
              candidateId: cand.id,
              candidates: compiled.candidates,
              chosenOptionIds: policy.bestSubset.optionIds,
              prompt,
              regime: effectiveRegime,
              reachability: cand.reachability,
            },
            facets: { "ui-prototype": html },
            html,
            energy: createDefaultEnergyEnvelope(),
          };
          if (!branchNode.shadowStaged) {
            Object.assign(
              branchNode,
              resolveOpenCanvasPosition(
                canvasState.nodes,
                branchNode.x,
                branchNode.y,
                branchNode.width,
                branchNode.height,
              ),
            );
          }
          canvasState.nodes.push(branchNode);
          materializedNodes.push(branchNode);
          if (body.parentNodeId) {
            canvasState.edges.push({
              id: `edge-auto-${Date.now().toString(36)}-${idx}`,
              from: body.parentNodeId,
              to: branchNode.id,
              relation: "forks",
              kind: "forks",
              label: regimeLabel,
            });
          }
        });

        canvasState.userModel = recordAutonomousActionOnUserModel(
          canvasState.userModel,
          sealedPrediction,
        );
      }

      saveCanvasState(canvasState);
      await recordDomainCommand(
        "decision.compile",
        decisionNode?.id || materializedNodes[0]?.id || "canvas-root",
        `decision.${effectiveRegime}`,
        {
          predictionId: sealedPrediction.id,
          regime: effectiveRegime,
          predictedSubsetKey: sealedPrediction.predictedSubsetKey,
          materializedNodeIds: materializedNodes.map((n) => n.id),
        },
        [],
        body.commandId,
      );
      broadcastState();

      return (
        sendJson(res, 200, {
          regime: effectiveRegime,
          policy,
          sealedPrediction,
          candidates: compiled.candidates,
          decisionNode,
          materializedNodes,
          userModel: canvasState.userModel,
          state: canvasState,
        }),
        true
      );
    } catch (err) {
      return (sendJson(res, requestErrorStatus(err), { error: err.message }), true);
    }
  }

  if (req.method === "POST" && url.pathname === "/api/decisions/resolve") {
    try {
      const canvasState = getCanvasState();
      canvasState.userModel = canvasState.userModel || createDefaultUserModel();
      const {
        predictionId,
        nodeId,
        chosenOptionIds = [],
        commandId,
      } = await readJsonBody(req);

      const pred = canvasState.userModel.sealedPredictions.find(
        (p) => p.id === predictionId,
      );
      if (!pred) return (sendJson(res, 404, { error: "Prediction not found" }), true);
      const decNode = canvasState.nodes.find((n) => n.id === nodeId);
      if (nodeId && !decNode) {
        return (sendJson(res, 404, { error: "Decision node not found" }), true);
      }
      if (nodeId && decNode.decisionMeta?.predictionId !== predictionId) {
        return (
          sendJson(res, 400, { error: "Prediction does not match decision node" }),
          true
        );
      }
      if (pred.resolvedAt || decNode?.decisionMeta?.resolved) {
        return (
          sendJson(res, 409, {
            error: "Decision already resolved",
            resolvedPrediction: pred,
          }),
          true
        );
      }
      const scored = scoreSealedPrediction({
        userModel: canvasState.userModel,
        predictionId,
        chosenOptionIds,
      });
      canvasState.userModel = scored.updatedUserModel;

      const spawnedNodes = [];

      if (decNode && decNode.decisionMeta) {
        decNode.decisionMeta.resolved = true;
        decNode.decisionMeta.resolvedReceipt = scored.resolvedPrediction;
        decNode.status = "committed";
        decNode.commitment = "committed";
        const updatedHtml = renderCompiledDecisionSurfaceHtml({
          nodeId: decNode.id,
          prompt: decNode.decisionMeta.prompt,
          candidates: decNode.decisionMeta.candidates || [],
          predictionId,
          resolvedReceipt: scored.resolvedPrediction,
        });
        decNode.html = updatedHtml;
        decNode.facets = { ...(decNode.facets || {}), dialogue: updatedHtml };
        decNode.height = 195;

        const chosenSet = new Set(scored.resolvedPrediction.chosenOptionIds);
        const chosenCandidates = (decNode.decisionMeta.candidates || []).filter((c) =>
          chosenSet.has(c.id),
        );
        const tuple = pickIdeonomyTuple({ mode: "plain" });

        chosenCandidates.forEach((cand, idx) => {
          const childId = `node-choice-${Date.now().toString(36)}-${idx}`;
          const childHtml = renderAutonomousBranchHtml({
            candidate: cand,
            prompt: decNode.decisionMeta.prompt,
            ideonomyTuple: tuple,
            regimeLabel:
              chosenCandidates.length >= 2
                ? `✦ Co-Forked (${idx + 1}/${chosenCandidates.length})`
                : "✓ Selected Path",
          });
          const childNode = {
            id: childId,
            title: cand.label,
            kind: "surface",
            stage: "design",
            surfaceRole: "ui-prototype",
            commitment: "committed",
            status: "committed",
            projectId: decNode.projectId || canvasState.activeProjectId,
            x: decNode.x + (idx - (chosenCandidates.length - 1) / 2) * 415,
            y: decNode.y + 225,
            width: 395,
            height: 255,
            model: decNode.model || DEFAULT_MODEL,
            parentId: decNode.id,
            facets: { "ui-prototype": childHtml },
            html: childHtml,
            energy: createDefaultEnergyEnvelope(),
          };
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
          spawnedNodes.push(childNode);
          canvasState.edges.push({
            id: `edge-choice-${Date.now().toString(36)}-${idx}`,
            from: decNode.id,
            to: childNode.id,
            relation: "forks",
            kind: "forks",
            label: chosenCandidates.length >= 2 ? "✦ co-fork" : "→ chosen",
          });
        });
      }

      saveCanvasState(canvasState);
      await recordDomainCommand(
        "decision.resolve",
        nodeId || predictionId,
        "decision.sealed_prediction.scored",
        {
          predictionId,
          chosenSubsetKey: scored.resolvedPrediction.chosenSubsetKey,
          brierScore: scored.resolvedPrediction.brierScore,
          accurate: scored.resolvedPrediction.accurate,
          spawnedNodeIds: spawnedNodes.map((n) => n.id),
        },
        [],
        commandId,
      );
      broadcastState();

      return (
        sendJson(res, 200, {
          resolvedPrediction: scored.resolvedPrediction,
          spawnedNodes,
          userModel: canvasState.userModel,
          calibration: computeEmpiricalCalibrationFactor(
            canvasState.userModel.hypotheses,
          ),
          state: canvasState,
        }),
        true
      );
    } catch (err) {
      return (sendJson(res, requestErrorStatus(err), { error: err.message }), true);
    }
  }

  if (
    (req.method === "GET" || req.method === "POST") &&
    url.pathname === "/api/ideonomy/pick"
  ) {
    try {
      const body = req.method === "POST" ? await readJsonBody(req) : {};
      const mode = url.searchParams.get("mode") || body.mode || "rich";
      const seedParam = url.searchParams.get("seed") ?? body.seed;
      const seed =
        seedParam !== undefined && seedParam !== null ? Number(seedParam) : undefined;
      const tuple = pickIdeonomyTuple({
        mode,
        seed: Number.isFinite(seed) ? seed : undefined,
        forceOperators: Array.isArray(body.forceOperators) ? body.forceOperators : [],
        touchCooldown: seed === undefined,
      });
      return (
        sendJson(res, 200, {
          mode,
          pivotDimension: tuple.pivotDimension,
          pivotDimensionId: tuple.pivotDimension,
          tuple: {
            mode,
            operatorIds: tuple.operatorIds,
            organonIds: tuple.organonIds,
            dimensionIds: tuple.dimensionIds,
            pivotDimension: tuple.pivotDimension,
            pivotDimensionId: tuple.pivotDimension,
            tupleLabel: tuple.tupleLabel,
            promptBlock: tuple.promptBlock,
          },
          catalog: getIdeonomyCatalogSummary(),
        }),
        true
      );
    } catch (err) {
      return (sendJson(res, requestErrorStatus(err), { error: err.message }), true);
    }
  }

  if (
    (req.method === "POST" || req.method === "GET") &&
    url.pathname === "/api/energy/basal-tick"
  ) {
    try {
      const canvasState = getCanvasState();
      for (const n of canvasState.nodes) {
        if (!n.energy) {
          n.energy = createDefaultEnergyEnvelope();
        }
        const w = normalizeWarrant(n);
        n.warrant = w.warrant;
        const downstreamCount = (canvasState.edges || []).filter(
          (e) => e.from === n.id,
        ).length;
        n.attentionBid = computeAttentionBid({
          warrant: n.warrant,
          jevScore: n.jevScore,
          downstreamCount,
          opticMode:
            n.surfaceRole === "ui-prototype"
              ? "exhibit"
              : n.surfaceRole === "dialogue"
                ? "steer"
                : "observe",
        });
      }

      const result = allocateBasalFreeEnergy(canvasState.nodes);
      const byId = new Map(canvasState.nodes.map((n) => [n.id, n]));
      for (const alloc of result.allocations) {
        const target = byId.get(alloc.nodeId);
        if (target) {
          target.energy = alloc.updatedEnvelope;
        }
      }

      const attentionQueue = [...canvasState.nodes]
        .sort(
          (a, b) =>
            (b.attentionBid?.evoiScore || 0) - (a.attentionBid?.evoiScore || 0),
        )
        .map((n) => ({
          nodeId: n.id,
          title: n.title,
          surfaceRole: n.surfaceRole || defaultRoleForStage(n.stage),
          evoiScore: n.attentionBid?.evoiScore ?? 0,
          epistemicEntropy: n.attentionBid?.epistemicEntropy ?? 0,
          remainingTokens: n.energy?.remainingTokens ?? 0,
          basalRechargedTokens: n.energy?.basalRechargedTokens ?? 0,
        }));

      saveCanvasState(canvasState);
      broadcastState();
      return (
        sendJson(res, 200, {
          totalGrantedTokens: result.totalGrantedTokens,
          allocations: result.allocations,
          attentionQueue,
          state: canvasState,
        }),
        true
      );
    } catch (err) {
      return (sendJson(res, requestErrorStatus(err), { error: err.message }), true);
    }
  }

  if (req.method === "POST" && url.pathname === "/api/ideabox/seed") {
    try {
      const canvasState = getCanvasState();
      const body = await readJsonBody(req);
      const prompt =
        body.seedPrompt ||
        body.prompt ||
        "Autonomous voice + gesture co-design surface with live worktree verification";
      const {
        sourceNodeId,
        unfoldImmediately = false,
        x,
        y,
        commandId,
      } = body;

      let seedNode = sourceNodeId
        ? canvasState.nodes.find((n) => n.id === sourceNodeId)
        : null;

      if (sourceNodeId && !seedNode) {
        return (sendJson(res, 404, { error: "Source node not found" }), true);
      }
      const seedTuple = pickIdeonomyTuple({ mode: "rich" });
      if (!seedNode) {
        const ts = Date.now();
        const seedId = `node-seed-${ts}`;
        const maxY = canvasState.nodes
          .filter((n) => !n.shadowStaged)
          .reduce((m, n) => Math.max(m, n.y + (n.height || 300)), 40);
        const seedHtml = `<div style="font-family:'Inter',system-ui,sans-serif;padding:14px 16px;color:#e2e8f0;font-size:12px;line-height:1.5;">
  <p style="margin:0 0 12px;color:#94a3b8;font-size:11.5px;">${escapeHtml(String(prompt).slice(0, 120))} — 4 background branches staged in the Shadow Graph.</p>
  <button onclick="window.asterism.unfoldShadowChildren()" style="width:100%;padding:7px 10px;border-radius:6px;border:1px solid rgba(56,189,248,0.3);background:rgba(56,189,248,0.1);color:#e0f2fe;font-size:11px;font-weight:500;cursor:pointer;">Unfold Staged Branches</button>
  ${renderIdeonomyMachineryHtml({
    tuple: seedTuple,
    ideaTitle: `Seed: ${prompt.slice(0, 36)}`,
  })}
</div>`;
        seedNode = {
          id: seedId,
          title: `Seed: ${prompt.slice(0, 44)}`,
          kind: "surface",
          stage: "note",
          stratum: "intent",
          surfaceRole: "dialogue",
          commitment: "committed",
          shadowStaged: false,
          projectId: canvasState.activeProjectId || "proj-misc-attic",
          ideonomyTuple: {
            operatorIds: seedTuple.operatorIds,
            organonIds: seedTuple.organonIds,
            dimensionIds: seedTuple.dimensionIds,
            tupleLabel: seedTuple.tupleLabel,
          },
          warrant: {
            _tag: "Open",
            pass: 0.75,
            abstain: 0.25,
          },
          energy: createDefaultEnergyEnvelope({ remainingTokens: 3600 }),
          x: typeof x === "number" ? x : 25,
          y: typeof y === "number" ? y : maxY + 45,
          width: 405,
          height: 295,
          model: DEFAULT_MODEL,
          status: "ready",
          branchTag: "idea-seed",
          state: { seedPrompt: prompt },
          facets: { dialogue: seedHtml },
          html: seedHtml,
        };
        if (!seedNode.shadowStaged) {
          Object.assign(
            seedNode,
            resolveOpenCanvasPosition(
              canvasState.nodes,
              seedNode.x,
              seedNode.y,
              seedNode.width,
              seedNode.height,
            ),
          );
        }
        canvasState.nodes.push(seedNode);
      } else {
        seedNode.shadowStaged = false;
        if (!seedNode.ideonomyTuple) {
          seedNode.ideonomyTuple = {
            operatorIds: seedTuple.operatorIds,
            organonIds: seedTuple.organonIds,
            dimensionIds: seedTuple.dimensionIds,
            tupleLabel: seedTuple.tupleLabel,
          };
        }
      }

      const matchCandidates = rankMatchmakerCandidates(
        prompt,
        canvasState.nodes.filter((n) => !n.shadowStaged),
        new Set([seedNode.id]),
      );
      const topMatch = matchCandidates[0] || null;

      const { shadowBranches, matchmakerHybrid } =
        await runIdeonomyAndMatchmakerPipeline({
          seedNode,
          seedPrompt: prompt,
          matchedTargetNode: topMatch?.node || null,
          affinityScore: topMatch?.affinityScore ?? 0.82,
          sharedConcepts: topMatch?.sharedConcepts ?? [],
        });

      const childEnergy = attenuateEnergyForBranches(
        seedNode.energy || createDefaultEnergyEnvelope(),
        shadowBranches.length + (matchmakerHybrid ? 1 : 0),
      );

      const stagedNodes = [];
      for (const sb of shadowBranches) {
        sb.energy = childEnergy;
        sb.shadowStaged = !unfoldImmediately;
        if (!sb.shadowStaged) {
          Object.assign(
            sb,
            resolveOpenCanvasPosition(
              canvasState.nodes,
              sb.x,
              sb.y,
              sb.width,
              sb.height,
            ),
          );
        }
        canvasState.nodes.push(sb);
        stagedNodes.push(sb);
        canvasState.edges.push({
          id: `edge-ideo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          from: seedNode.id,
          to: sb.id,
          relation: sb.relationFromParent,
          kind: "ideonomy",
          shadowStaged: !unfoldImmediately,
          label: `${sb.stance} (${sb.warrant.pass})`,
        });
      }

      let jumpEdge = null;
      if (matchmakerHybrid && topMatch?.node) {
        matchmakerHybrid.energy = childEnergy;
        matchmakerHybrid.shadowStaged = !unfoldImmediately;
        if (!matchmakerHybrid.shadowStaged) {
          Object.assign(
            matchmakerHybrid,
            resolveOpenCanvasPosition(
              canvasState.nodes,
              matchmakerHybrid.x,
              matchmakerHybrid.y,
              matchmakerHybrid.width,
              matchmakerHybrid.height,
            ),
          );
        }
        canvasState.nodes.push(matchmakerHybrid);
        stagedNodes.push(matchmakerHybrid);

        jumpEdge = {
          id: `edge-jump-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          from: seedNode.id,
          to: topMatch.node.id,
          relation: "cross-pollinates",
          kind: "jump",
          label: `🧲 lateral jump (affinity=${topMatch.affinityScore})`,
        };
        canvasState.edges.push(jumpEdge);
        canvasState.edges.push({
          id: `edge-mm1-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          from: seedNode.id,
          to: matchmakerHybrid.id,
          relation: "synthesizes",
          kind: "synthesis",
          shadowStaged: !unfoldImmediately,
          label: `⊕ matchmaker ⋈`,
        });
        canvasState.edges.push({
          id: `edge-mm2-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          from: topMatch.node.id,
          to: matchmakerHybrid.id,
          relation: "synthesizes",
          kind: "synthesis",
          shadowStaged: !unfoldImmediately,
          label: `⊕ cross-pollinates`,
        });
      }

      const attentionBroker = computeAttentionBrokerSnapshot(canvasState);
      saveCanvasState(canvasState);
      await recordDomainCommand(
        "ideabox.seed",
        seedNode.id,
        "ideabox.constellation.staged",
        {
          seedNodeId: seedNode.id,
          prompt,
          stagedNodeIds: stagedNodes.map((n) => n.id),
          matchedNodeId: topMatch?.node?.id || null,
          affinityScore: topMatch?.affinityScore || null,
        },
        [],
        commandId,
      );
      broadcastState();

      return (
        sendJson(res, 200, {
          seedNode,
          stagedNodes,
          shadowBranches: stagedNodes,
          matchedTargetNode: topMatch?.node || null,
          affinityScore: topMatch?.affinityScore || null,
          jumpEdge,
          attentionBroker,
          state: canvasState,
        }),
        true
      );
    } catch (err) {
      return (sendJson(res, requestErrorStatus(err), { error: err.message }), true);
    }
  }

  if (req.method === "POST" && url.pathname === "/api/shadow/unfold") {
    try {
      const canvasState = getCanvasState();
      const { parentNodeId, nodeIds, commandId } = await readJsonBody(req);
      const targetSet =
        Array.isArray(nodeIds) && nodeIds.length > 0 ? new Set(nodeIds) : null;

      const unfoldedIds = [];
      for (const n of canvasState.nodes) {
        if (!n.shadowStaged) continue;
        const matchParent = parentNodeId ? n.parentId === parentNodeId : true;
        const matchId = targetSet ? targetSet.has(n.id) : true;
        if (matchParent && matchId) {
          Object.assign(
            n,
            resolveOpenCanvasPosition(
              canvasState.nodes,
              n.x,
              n.y,
              n.width,
              n.height,
              28,
              new Set([n.id]),
            ),
          );
          n.shadowStaged = false;
          unfoldedIds.push(n.id);
        }
      }

      const unfoldedSet = new Set(unfoldedIds);
      for (const e of canvasState.edges) {
        if (e.shadowStaged && (unfoldedSet.has(e.to) || unfoldedSet.has(e.from))) {
          e.shadowStaged = false;
        }
      }

      const attentionBroker = computeAttentionBrokerSnapshot(canvasState);
      saveCanvasState(canvasState);
      await recordDomainCommand(
        "shadow.unfold",
        parentNodeId || "canvas-root",
        "shadow.branches.unfolded",
        { parentNodeId: parentNodeId || null, unfoldedIds },
        [],
        commandId,
      );
      broadcastState();

      return (
        sendJson(res, 200, {
          unfoldedIds,
          unfoldedNodeIds: unfoldedIds,
          attentionBroker,
          state: canvasState,
        }),
        true
      );
    } catch (err) {
      return (sendJson(res, requestErrorStatus(err), { error: err.message }), true);
    }
  }

  if (req.method === "GET" && url.pathname === "/api/attention/queue") {
    return (
      sendJson(res, 200, computeAttentionBrokerSnapshot(getCanvasState())),
      true
    );
  }

  if (req.method === "POST" && url.pathname === "/api/attention/auto-resolve") {
    try {
      const canvasState = getCanvasState();
      const { nodeId, commandId } = await readJsonBody(req);
      const attentionBrokerBefore = computeAttentionBrokerSnapshot(canvasState);
      const targetId =
        nodeId ||
        attentionBrokerBefore.queue.find(
          (item) =>
            canvasState.nodes.find((n) => n.id === item.nodeId)?.kind !==
            "decision",
        )?.nodeId;
      const targetNode = canvasState.nodes.find((n) => n.id === targetId);
      if (!targetNode) {
        return (
          sendJson(res, 404, { error: "No pending attention item found" }),
          true
        );
      }

      if (targetNode.kind === "decision") {
        return (
          sendJson(res, 400, {
            error: "Decision cards require explicit resolution via /api/decisions/resolve",
          }),
          true
        );
      }

      targetNode.shadowStaged = false;
      targetNode.commitment = "committed";
      targetNode.status = "committed";
      targetNode.kind = "surface";
      targetNode.state = {
        ...(targetNode.state || {}),
        autoResolvedViaAskDefault:
          targetNode.askDefault || "Keep & Promote to Active Canvas",
        resolvedAt: new Date().toISOString(),
      };

      for (const e of canvasState.edges) {
        if (e.to === targetNode.id || e.from === targetNode.id) {
          e.shadowStaged = false;
        }
      }

      const attentionBroker = computeAttentionBrokerSnapshot(canvasState);
      saveCanvasState(canvasState);
      await recordDomainCommand(
        "attention.auto_resolve",
        targetNode.id,
        "attention.ask_default.applied",
        {
          nodeId: targetNode.id,
          appliedDecision: targetNode.state.autoResolvedViaAskDefault,
        },
        [],
        commandId,
      );
      broadcastState();

      return (
        sendJson(res, 200, {
          resolvedNode: targetNode,
          appliedDecision: targetNode.state.autoResolvedViaAskDefault,
          attentionBroker,
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
