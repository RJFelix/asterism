import crypto from "node:crypto";
import {
  recordBehavioralObservation,
  computeEmpiricalCalibrationFactor,
} from "@asterism/core";
import { getDefaultCanvasState } from "../default-state.mjs";
import {
  SURFACE_ROLES,
  PANEL_RELATIONS,
  defaultRoleForStage,
} from "../llm.mjs";
import {
  restoreCanvasLayout,
  normalizeCanvasState,
  discoverSuperrepoProjects,
  resolveOpenCanvasPosition,
} from "../canvas-state.mjs";
import {
  escapeHtml,
  readJsonBody,
  requestErrorStatus,
  sendJson,
} from "../http-helpers.mjs";

export async function handleCanvasRoutes(req, res, url, ctx) {
  const {
    getCanvasState,
    setCanvasState,
    saveCanvasState,
    broadcastState,
    recordDomainCommand,
    superrepoRoot,
  } = ctx;

  if (req.method === "GET" && url.pathname === "/api/state") {
    return (sendJson(res, 200, getCanvasState()), true);
  }

  if (req.method === "POST" && url.pathname === "/api/reset") {
    const fresh = normalizeCanvasState(getDefaultCanvasState());
    fresh.projects = discoverSuperrepoProjects(fresh.projects, superrepoRoot);
    setCanvasState(fresh);
    saveCanvasState(fresh);
    await recordDomainCommand("canvas.reset", "canvas-root", "canvas.reset", {
      nodeCount: fresh.nodes.length,
    });
    broadcastState();
    return (sendJson(res, 200, fresh), true);
  }

  if (req.method === "POST" && url.pathname === "/api/state") {
    try {
      const next = await readJsonBody(req);
      const updated = normalizeCanvasState({ ...getCanvasState(), ...next });
      if (next.viewProjection === "canvas") restoreCanvasLayout(updated);
      setCanvasState(updated);
      saveCanvasState(updated);
      broadcastState();
      return (sendJson(res, 200, updated), true);
    } catch (err) {
      return (sendJson(res, err.statusCode || 400, { error: err.message }), true);
    }
  }

  if (
    req.method === "GET" &&
    ["/api/views/table", "/api/views/timeline"].includes(url.pathname)
  ) {
    const canvasState = getCanvasState();
    const nodes = [...canvasState.nodes].sort(
      url.pathname.endsWith("timeline")
        ? (a, b) =>
            String(a.createdAt || a.updatedAt || "").localeCompare(
              String(b.createdAt || b.updatedAt || ""),
            ) || a.id.localeCompare(b.id)
        : (a, b) =>
            String(a.title || "").localeCompare(String(b.title || "")) ||
            a.id.localeCompare(b.id),
    );
    return (sendJson(res, 200, { nodes, edges: canvasState.edges }), true);
  }

  if (
    req.method === "POST" &&
    [
      "/api/nodes/move",
      "/api/nodes/create",
      "/api/nodes/update",
      "/api/nodes/delete",
      "/api/edges",
    ].includes(url.pathname)
  ) {
    const body = await readJsonBody(req);
    let canvasState = getCanvasState();
    let result = {};

    if (url.pathname === "/api/nodes/create") {
      if (!body.node || typeof body.node !== "object" || Array.isArray(body.node)) {
        return (sendJson(res, 400, { error: "node must be an object" }), true);
      }
      const stage = body.node.stage || "note";
      const surfaceRole = body.node.surfaceRole || defaultRoleForStage(stage);
      const node = {
        width: 400,
        height: 260,
        kind: "surface",
        stage,
        surfaceRole,
        commitment: body.node.commitment || "committed",
        status: body.node.status || "ready",
        model: body.node.model || "antigravity/gemini-4-neon",
        provider: body.node.provider || "antigravity",
        projectId: body.node.projectId || canvasState.activeProjectId || "proj-misc-attic",
        state: {},
        ...body.node,
        id: body.node.id || "node-" + crypto.randomUUID(),
      };
      if (typeof node.id !== "string" || canvasState.nodes.some((n) => n.id === node.id)) {
        return (sendJson(res, 400, { error: "Invalid or duplicate node id" }), true);
      }
      for (const key of ["width", "height"]) {
        if (!Number.isFinite(node[key]) || node[key] <= 0) {
          node[key] = key === "width" ? 400 : 260;
        }
      }
      if (!node.html) {
        node.html = `<div style="font-family:'Inter',system-ui,sans-serif;padding:14px 16px;color:#e2e8f0;font-size:12px;line-height:1.5;">${escapeHtml(node.summary || node.title || "New thought")}</div>`;
      }
      node.facets = { ...(node.facets || {}), [node.surfaceRole]: node.html };
      Object.assign(
        node,
        resolveOpenCanvasPosition(canvasState.nodes, node.x, node.y, node.width, node.height),
      );
      canvasState.nodes.push(node);
      if (body.parentNodeId && canvasState.nodes.some((n) => n.id === body.parentNodeId)) {
        const relation = body.relation || node.relationFromParent || "advances";
        const relMeta = PANEL_RELATIONS[relation] || PANEL_RELATIONS.advances;
        node.parentId = body.parentNodeId;
        node.parentIds = [body.parentNodeId];
        canvasState.edges.push({
          id: `edge-${crypto.randomUUID().slice(0, 8)}`,
          from: body.parentNodeId,
          to: node.id,
          relation,
          kind: relation,
          label: relMeta.label,
        });
      }
      result = { node };
    } else if (url.pathname === "/api/nodes/update") {
      const node = canvasState.nodes.find((n) => n.id === body.nodeId);
      if (!node) return (sendJson(res, 404, { error: "Node not found" }), true);
      for (const key of [
        "title",
        "html",
        "stage",
        "surfaceRole",
        "commitment",
        "status",
        "model",
        "provider",
        "summary",
        "projectId",
      ]) {
        if (typeof body[key] === "string") node[key] = body[key];
      }
      for (const key of ["width", "height"]) {
        if (Number.isFinite(body[key]) && body[key] > 0) node[key] = body[key];
      }
      if (body.state && typeof body.state === "object" && !Array.isArray(body.state)) {
        node.state = { ...(node.state || {}), ...body.state };
      }
      if (typeof body.html === "string") {
        const role = node.surfaceRole || defaultRoleForStage(node.stage);
        node.facets = { ...(node.facets || {}), [role]: body.html };
      }
      node.updatedAt = new Date().toISOString();
      result = { node };
    } else if (url.pathname === "/api/edges") {
      if (body.action === "delete") {
        if (!canvasState.edges.some((e) => e.id === body.edgeId)) {
          return (sendJson(res, 404, { error: "Edge not found" }), true);
        }
        canvasState.edges = canvasState.edges.filter((e) => e.id !== body.edgeId);
      } else if (body.action === "create") {
        const edge = body.edge;
        if (
          !edge ||
          !canvasState.nodes.some((n) => n.id === edge.from) ||
          !canvasState.nodes.some((n) => n.id === edge.to)
        ) {
          return (sendJson(res, 400, { error: "Invalid edge endpoints" }), true);
        }
        if (
          !canvasState.edges.some(
            (e) =>
              e.from === edge.from && e.to === edge.to && e.relation === edge.relation,
          )
        ) {
          const id = edge.id || "edge-" + crypto.randomUUID();
          if (typeof id !== "string" || canvasState.edges.some((e) => e.id === id)) {
            return (sendJson(res, 400, { error: "Invalid or duplicate edge id" }), true);
          }
          canvasState.edges.push({ ...edge, id });
        }
      } else {
        return (sendJson(res, 400, { error: "Invalid edge action" }), true);
      }
    } else {
      const node = canvasState.nodes.find((n) => n.id === body.nodeId);
      if (!node) return (sendJson(res, 404, { error: "Node not found" }), true);
      if (url.pathname === "/api/nodes/delete") {
        if (node.kind === "speculative" || node.commitment === "speculative") {
          canvasState.userModel = recordBehavioralObservation(canvasState.userModel, {
            type: "branch-pruned",
            projectId: canvasState.activeProjectId,
            nodeId: node.id,
          }).updatedUserModel;
        }
        canvasState.nodes = canvasState.nodes.filter((n) => n.id !== node.id);
        canvasState = normalizeCanvasState(canvasState);
        setCanvasState(canvasState);
        result = { deletedId: node.id };
      } else {
        for (const key of ["x", "y", "width", "height"]) {
          if (Number.isFinite(body[key])) node[key] = body[key];
        }
        if (canvasState.viewProjection !== "plex") {
          if (Number.isFinite(body.x)) node.canvasX = node.x;
          if (Number.isFinite(body.y)) node.canvasY = node.y;
        }
        result = { node };
      }
    }

    saveCanvasState(canvasState);
    broadcastState();
    return (sendJson(res, 200, { ...result, state: canvasState }), true);
  }

  // Bidirectional Surface <-> Agent Bridge (`window.asterism.setState`, Role & Model Selection)
  if (req.method === "POST" && url.pathname === "/api/nodes/state") {
    try {
      const { nodeId, patch, model, provider, surfaceRole, commandId } =
        await readJsonBody(req);
      const canvasState = getCanvasState();
      const node = canvasState.nodes.find((n) => n.id === nodeId);
      if (!node) return (sendJson(res, 404, { error: "Node not found" }), true);

      if (patch && typeof patch === "object") {
        node.state = { ...(node.state || {}), ...patch };
      }
      if (typeof model === "string" && model.trim()) {
        node.model = model.trim();
      }
      if (typeof provider === "string" && provider.trim()) {
        node.provider = provider.trim();
      }
      if (typeof surfaceRole === "string" && SURFACE_ROLES[surfaceRole]) {
        node.surfaceRole = surfaceRole;
      }

      saveCanvasState(canvasState);
      await recordDomainCommand(
        "node.state.patch",
        node.id,
        "surface.state.updated",
        {
          nodeId: node.id,
          patch: patch || {},
          model: node.model,
          surfaceRole: node.surfaceRole,
          state: node.state || {},
        },
        [],
        commandId,
      );
      broadcastState();
      return (sendJson(res, 200, { node, state: canvasState }), true);
    } catch (err) {
      return (sendJson(res, requestErrorStatus(err), { error: err.message }), true);
    }
  }

  // Global Workspace Projects with Automatic Superrepo Discovery (`GET /api/projects` & `POST /api/projects`)
  if (
    (req.method === "GET" || req.method === "POST") &&
    url.pathname === "/api/projects"
  ) {
    try {
      const canvasState = getCanvasState();
      if (!Array.isArray(canvasState.projects) || canvasState.projects.length === 0) {
        const def = getDefaultCanvasState();
        canvasState.projects = def.projects;
        canvasState.activeProjectId = def.activeProjectId;
      }
      canvasState.projects = discoverSuperrepoProjects(canvasState.projects, superrepoRoot);

      if (req.method === "GET") {
        const activeProject =
          canvasState.projects.find((p) => p.id === canvasState.activeProjectId) ||
          canvasState.projects[0];
        return (
          sendJson(res, 200, {
            activeProjectId: activeProject.id,
            activeProject,
            projects: canvasState.projects,
            superrepoRoot,
          }),
          true
        );
      }

      const body = await readJsonBody(req);
      if (body.name && body.repoPath) {
        const newProj = {
          id: body.id || `proj-${Date.now().toString(36)}`,
          name: String(body.name).trim(),
          repoPath: String(body.repoPath).trim(),
          isDefaultMisc: Boolean(body.isDefaultMisc),
          description:
            body.description || `Project workspace at ${body.repoPath}`,
        };
        canvasState.projects = canvasState.projects.filter((p) => p.id !== newProj.id);
        canvasState.projects.push(newProj);
        canvasState.activeProjectId = newProj.id;
      } else if (body.activeProjectId) {
        const exists = canvasState.projects.find((p) => p.id === body.activeProjectId);
        if (!exists) {
          return (sendJson(res, 404, { error: "Project not found" }), true);
        }
        canvasState.activeProjectId = exists.id;
      }
      const activeProject =
        canvasState.projects.find((p) => p.id === canvasState.activeProjectId) ||
        canvasState.projects[0];
      saveCanvasState(canvasState);
      broadcastState();
      return (
        sendJson(res, 200, {
          activeProjectId: activeProject.id,
          activeProject,
          projects: canvasState.projects,
          state: canvasState,
        }),
        true
      );
    } catch (err) {
      return (sendJson(res, requestErrorStatus(err), { error: err.message }), true);
    }
  }

  // TheBrain-Style Plex Focus & Multi-View Graph Projection (`GET /api/views/plex` & `POST /api/views/plex`)
  if (
    (req.method === "GET" || req.method === "POST") &&
    url.pathname === "/api/views/plex"
  ) {
    try {
      const canvasState = getCanvasState();
      const body = req.method === "POST" ? await readJsonBody(req) : {};
      if (
        req.method === "POST" &&
        (body.restoreCanvasLayout || body.viewProjection === "canvas")
      ) {
        restoreCanvasLayout(canvasState);
        canvasState.viewProjection = "canvas";
        saveCanvasState(canvasState);
        broadcastState();
        return (sendJson(res, 200, { state: canvasState, viewProjection: "canvas" }), true);
      }
      const explicitId = url.searchParams.get("focusNodeId") || body.focusNodeId;
      const target = canvasState.nodes.find((n) => n.id === explicitId);
      if (target?.shadowStaged && req.method === "POST") {
        Object.assign(
          target,
          resolveOpenCanvasPosition(
            canvasState.nodes,
            target.x,
            target.y,
            target.width,
            target.height,
            28,
            new Set([target.id]),
          ),
        );
        target.shadowStaged = false;
        for (const edge of canvasState.edges) {
          if (edge.from === target.id || edge.to === target.id) edge.shadowStaged = false;
        }
      }
      const visibleNodes = canvasState.nodes.filter((n) => !n.shadowStaged);
      if (explicitId && !visibleNodes.some((n) => n.id === explicitId)) {
        return (sendJson(res, 404, { error: "Focus node not found" }), true);
      }
      const requestedId = explicitId || canvasState.plexFocusNodeId || visibleNodes[0]?.id;
      const focusNode = visibleNodes.find((n) => n.id === requestedId) || visibleNodes[0];
      if (!focusNode) {
        return (sendJson(res, 404, { error: "No visible focus node found" }), true);
      }

      const byId = new Map(visibleNodes.map((n) => [n.id, n]));
      const parents = [];
      const children = [];
      const lateral = [];
      const seen = new Set([focusNode.id]);

      const isLateralEdge = (e, peerNode) =>
        e.kind === "jump" ||
        e.kind === "association" ||
        e.kind === "lens" ||
        e.relation === "association" ||
        e.relation === "cross-pollinates" ||
        e.relation === "annotates" ||
        e.relation === "synthesizes" ||
        e.relation === "implements" ||
        peerNode?.kind === "lens" ||
        (focusNode.parentId && peerNode?.id !== focusNode.parentId && e.to === focusNode.id);

      for (const edge of canvasState.edges || []) {
        if (edge.shadowStaged) continue;
        if (edge.to === focusNode.id && byId.has(edge.from) && !seen.has(edge.from)) {
          seen.add(edge.from);
          const node = byId.get(edge.from);
          if (isLateralEdge(edge, node)) {
            lateral.push({ node, edge, direction: "incoming-lateral" });
          } else {
            parents.push({ node, edge });
          }
        } else if (
          edge.from === focusNode.id &&
          byId.has(edge.to) &&
          !seen.has(edge.to)
        ) {
          seen.add(edge.to);
          const node = byId.get(edge.to);
          if (isLateralEdge(edge, node)) {
            lateral.push({ node, edge, direction: "outgoing-lateral" });
          } else {
            children.push({ node, edge });
          }
        }
      }

      if (focusNode.parentId) {
        for (const n of visibleNodes) {
          if (n.parentId === focusNode.parentId && !seen.has(n.id)) {
            seen.add(n.id);
            lateral.push({
              node: n,
              edge: {
                id: `sibling-${n.id}`,
                from: focusNode.parentId,
                to: n.id,
                relation: "sibling-fork",
                label: "sibling fork",
              },
              direction: "sibling",
            });
          }
        }
      }

      if (req.method === "POST") {
        canvasState.plexFocusNodeId = focusNode.id;
        if (body.viewProjection) {
          canvasState.viewProjection = body.viewProjection;
        }
        if (body.applyLayout) {
          for (const n of canvasState.nodes) {
            if (typeof n.canvasX !== "number") {
              n.canvasX = n.x;
              n.canvasY = n.y;
            }
          }
          const placed = [];
          const place = (node, x, y) => {
            Object.assign(
              node,
              resolveOpenCanvasPosition(
                placed,
                x,
                y,
                node.width || 400,
                node.height || 265,
              ),
            );
            placed.push(node);
          };
          const centerX = Math.max(
            900,
            parents.reduce((sum, p) => sum + (p.node.width || 400) + 28, 0) / 2 + 50,
          );
          place(
            focusNode,
            centerX - (focusNode.width || 400) / 2,
            parents.length > 0 ? 370 : 220,
          );
          let parentX = 40;
          for (const { node } of parents) {
            place(node, parentX, 40);
            parentX = node.x + (node.width || 400) + 28;
          }
          let childX = 40;
          for (const { node } of children) {
            place(node, childX, focusNode.y + (focusNode.height || 265) + 85);
            childX = node.x + (node.width || 400) + 28;
          }
          lateral.forEach(({ node }, idx) => {
            place(
              node,
              idx % 2 === 0
                ? focusNode.x - (node.width || 400) - 85
                : focusNode.x + (focusNode.width || 400) + 85,
              focusNode.y + Math.floor(idx / 2) * ((node.height || 265) + 28),
            );
          });
          for (const node of visibleNodes) {
            if (!placed.includes(node)) place(node, node.x, node.y);
          }
        }
        saveCanvasState(canvasState);
        broadcastState();
      }

      return (
        sendJson(res, 200, {
          viewProjection: canvasState.viewProjection || "plex",
          focusNodeId: focusNode.id,
          focusNode,
          parents: parents.map((p) => ({
            id: p.node.id,
            nodeId: p.node.id,
            title: p.node.title,
            stage: p.node.stage,
            surfaceRole: p.node.surfaceRole,
            relation: p.edge.relation || p.edge.kind || "advances",
          })),
          children: children.map((c) => ({
            id: c.node.id,
            nodeId: c.node.id,
            title: c.node.title,
            stage: c.node.stage,
            surfaceRole: c.node.surfaceRole,
            relation: c.edge.relation || c.edge.kind || "advances",
          })),
          lateral: lateral.map((l) => ({
            id: l.node.id,
            nodeId: l.node.id,
            title: l.node.title,
            stage: l.node.stage,
            surfaceRole: l.node.surfaceRole,
            relation: l.edge.relation || l.edge.kind || "jump",
            direction: l.direction,
          })),
          state: canvasState,
        }),
        true
      );
    } catch (err) {
      return (sendJson(res, requestErrorStatus(err), { error: err.message }), true);
    }
  }

  // Morning Coffee Ambient Digest (`GET /api/views/briefing`)
  if (req.method === "GET" && url.pathname === "/api/views/briefing") {
    const canvasState = getCanvasState();
    const model = canvasState.userModel;
    const predictions = model.sealedPredictions || [];
    return (
      sendJson(res, 200, {
        generatedAt: new Date().toISOString(),
        activeProject: canvasState.projects.find(
          (p) => p.id === canvasState.activeProjectId,
        ),
        needsYourCall: canvasState.nodes
          .filter((n) => (n.kind === "decision" && !n.decisionMeta?.resolved) || n.shadowStaged)
          .map((n) => ({
            nodeId: n.id,
            title: n.title,
            kind: n.kind,
            prompt: n.decisionMeta?.prompt || n.state?.seedPrompt || n.title,
            regime: n.decisionMeta?.regime || "shadow-staged",
            predictionId: n.decisionMeta?.predictionId || null,
            candidates: n.decisionMeta?.candidates || [],
            x: n.x,
            y: n.y,
          })),
        autonomousAndBasalMoves: canvasState.nodes
          .filter(
            (n) =>
              !n.shadowStaged &&
              n.kind !== "decision" &&
              (n.autonomousReceipt ||
                n.id.startsWith("node-synth-") ||
                (n.energy?.basalRechargedTokens || 0) > 0),
          )
          .map((n) => ({
            nodeId: n.id,
            title: n.title,
            stage: n.stage,
            surfaceRole: n.surfaceRole || defaultRoleForStage(n.stage),
            regime: n.autonomousReceipt?.regime || "basal-explore",
            reachability: n.autonomousReceipt?.reachability || "ergodic",
            predictionId: n.autonomousReceipt?.predictionId || null,
            canSwapCounterfactual: Boolean(n.autonomousReceipt?.predictionId),
            candidates: n.autonomousReceipt?.candidates || [],
            chosenOptionIds: n.autonomousReceipt?.chosenOptionIds || [],
            basalRechargedTokens: n.energy?.basalRechargedTokens || 0,
            x: n.x,
            y: n.y,
          })),
        modelShifts: {
          calibration: computeEmpiricalCalibrationFactor(model.hypotheses),
          totalPredictions: predictions.length,
          resolvedCount: predictions.filter((p) => p.resolvedAt).length,
          accurateCount: predictions.filter((p) => p.resolvedAt && p.accurate).length,
          inferredHypotheses: model.hypotheses.filter(
            (h) => h.source === "inferred" && h.status === "active",
          ),
          staleHypotheses: model.hypotheses.filter(
            (h) => h.status === "active" && h.usesSinceLastProbe >= 3,
          ),
          recentReceipts: predictions.filter((p) => p.resolvedAt).slice(0, 6),
        },
      }),
      true
    );
  }

  // Tidy Overlapping Cards (`POST /api/canvas/tidy`)
  if (req.method === "POST" && url.pathname === "/api/canvas/tidy") {
    try {
      const body = await readJsonBody(req);
      const canvasState = getCanvasState();
      const placed = [];
      let movedCount = 0;
      for (const node of canvasState.nodes
        .filter((n) => !n.shadowStaged)
        .sort((a, b) => a.y - b.y || a.x - b.x)) {
        const pos = resolveOpenCanvasPosition(
          placed,
          node.x,
          Math.max(node.y, placed.at(-1)?.y || 25),
          node.width || 400,
          node.height || 260,
        );
        if (
          placed.length &&
          (pos.y < placed.at(-1).y ||
            (pos.y === placed.at(-1).y && pos.x < placed.at(-1).x))
        ) {
          Object.assign(
            pos,
            resolveOpenCanvasPosition(
              placed,
              node.x,
              placed.at(-1).y + (placed.at(-1).height || 260) + 28,
              node.width || 400,
              node.height || 260,
            ),
          );
        }
        if (pos.x !== node.x || pos.y !== node.y) movedCount++;
        Object.assign(node, pos);
        placed.push(node);
      }
      saveCanvasState(canvasState);
      await recordDomainCommand(
        "canvas.tidy",
        "canvas-root",
        "canvas.tidied",
        { movedCount },
        [],
        body.commandId,
      );
      broadcastState();
      return (
        sendJson(res, 200, {
          movedCount,
          nodes: canvasState.nodes,
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
