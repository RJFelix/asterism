const LLM_BASE_URL = process.env.ASTERISM_LLM_URL || "https://llm.int.exe.xyz";
const DEFAULT_MODEL = process.env.ASTERISM_MODEL || "openai/gpt-6-luna";

const STAGE_ORDER = ["note", "brainstorm", "refine", "design", "implement"];

export function nextStageFor(currentStage = "note") {
  const idx = STAGE_ORDER.indexOf(currentStage);
  if (idx === -1 || idx === STAGE_ORDER.length - 1) return "implement";
  return STAGE_ORDER[idx + 1];
}

/**
 * Streams a completion from exe.dev's keyless LLM integration (/v1/responses)
 * and extracts the final text output.
 */
export async function callLlmResponses({ instructions, prompt, model = DEFAULT_MODEL }) {
  const res = await fetch(`${LLM_BASE_URL}/v1/responses`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      instructions,
      input: [{ role: "user", content: prompt }],
      store: false,
      stream: true
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`LLM HTTP ${res.status}: ${errText.slice(0, 300)}`);
  }

  const raw = await res.text();
  let fullText = "";
  for (const line of raw.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    const dataStr = line.slice(6).trim();
    if (!dataStr || dataStr === "[DONE]") continue;
    try {
      const evt = JSON.parse(dataStr);
      if (evt.type === "response.output_text.delta" && typeof evt.delta === "string") {
        fullText += evt.delta;
      } else if (evt.type === "response.completed" && !fullText && Array.isArray(evt.response?.output)) {
        for (const item of evt.response.output) {
          for (const c of item.content || []) {
            if (typeof c.text === "string") fullText += c.text;
          }
        }
      }
    } catch {
      // Ignore partial JSON lines
    }
  }

  return fullText.trim();
}

export function extractHtmlSnippet(raw) {
  const fenced = raw.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  return raw.trim();
}

export async function mutateHtmlSurface({ currentHtml, title, instruction, selectedSelector, model }) {
  const systemInstructions = `You are an expert UI/UX co-design agent inside Asterism, an infinite spatial canvas where every session is a live, malleable HTML surface on an "Innovation Train" (Note -> Brainstorm -> Refine -> Design -> Implement).
Update or redesign the provided HTML snippet according to the user's instruction.
Rules:
- Return ONLY a self-contained HTML fragment (a root <div> with an inline <style> tag and inline event handlers or <script> tag if interactive). Do NOT wrap in markdown code fences if possible, and do NOT include <html> or <head> tags.
- Use a sleek dark-mode aesthetic (#0f172a / #1e293b backgrounds, #e2e8f0 text, #38bdf8 / #a855f7 / #34d399 accents).
- Make controls genuinely interactive (sliders, tabs, live calculators, SVG visualizations, state toggles).`;

  const userPrompt = `Surface Title: ${title}
${selectedSelector ? `Focused Element: ${selectedSelector}\n` : ""}User Instruction: ${instruction}

Current HTML:
${currentHtml}`;

  const output = await callLlmResponses({
    instructions: systemInstructions,
    prompt: userPrompt,
    model
  });

  return extractHtmlSnippet(output);
}

export async function generateSpeculativeBranches({ sourceNode, prompt, count = 3 }) {
  const targetStage = sourceNode.stage === "note" ? "brainstorm" : sourceNode.stage || "design";
  const archetypes = [
    {
      tag: "fork-A",
      badgeColor: "#38bdf8",
      bgTint: "rgba(56,189,248,0.18)",
      btnColor: "#0284c7",
      lens: "Direct Manipulation & Spatial Controls (sliders, inline canvas handles, zero-chat visual feedback)"
    },
    {
      tag: "fork-B",
      badgeColor: "#c084fc",
      bgTint: "rgba(168,85,247,0.18)",
      btnColor: "#7e22ce",
      lens: "State Machine & Constraint Scrubber (timeline states, live tokens, deterministic checks)"
    },
    {
      tag: "fork-C",
      badgeColor: "#34d399",
      bgTint: "rgba(16,185,129,0.18)",
      btnColor: "#059669",
      lens: "Embodied / Multimodal & High-Density Telemetry (sensor/voice/camera hooks + fast Jev probability gauge)"
    }
  ].slice(0, count);

  const results = await Promise.all(
    archetypes.map(async (arch, idx) => {
      const nodeId = `node-spec-${Date.now()}-${idx}`;
      const score = (0.76 + Math.random() * 0.19).toFixed(2);
      try {
        const html = await mutateHtmlSurface({
          currentHtml: sourceNode.html,
          title: `${sourceNode.title} (${arch.tag})`,
          instruction: `${prompt || "Create a distinct interactive UI variant"}.
Specifically take this architectural lens: ${arch.lens}.
Include a top badge saying "SPECULATIVE ${arch.tag.toUpperCase()}" and a Jev Score of ${score}, plus action buttons at the bottom:
1) onclick="window.parent.postMessage({type:'asterism:commit-branch', nodeId:'${nodeId}'}, '*')" labeled "✓ Keep Fork"
2) onclick="window.parent.postMessage({type:'asterism:advance-stage', nodeId:'${nodeId}'}, '*')" labeled "🚂 Advance →"`,
          model: sourceNode.model || DEFAULT_MODEL
        });
        return {
          id: nodeId,
          title: `Speculative ${arch.tag}: ${arch.lens.split("(")[0].trim()}`,
          kind: "speculative",
          stage: targetStage,
          x: sourceNode.x + sourceNode.width + 95,
          y: sourceNode.y + (idx - 1) * 290,
          width: 380,
          height: 270,
          model: sourceNode.model || DEFAULT_MODEL,
          status: "speculative",
          branchTag: arch.tag,
          parentId: sourceNode.id,
          jevScore: Number(score),
          html
        };
      } catch (err) {
        return {
          id: nodeId,
          title: `Speculative ${arch.tag}: ${arch.lens.split("(")[0].trim()}`,
          kind: "speculative",
          stage: targetStage,
          x: sourceNode.x + sourceNode.width + 95,
          y: sourceNode.y + (idx - 1) * 290,
          width: 380,
          height: 270,
          model: sourceNode.model || DEFAULT_MODEL,
          status: "speculative",
          branchTag: arch.tag,
          parentId: sourceNode.id,
          jevScore: Number(score),
          html: `<div style="font-family:system-ui,sans-serif;padding:14px;color:#e2e8f0;font-size:12px;">
  <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
    <span style="background:${arch.bgTint};color:${arch.badgeColor};padding:2px 8px;border-radius:99px;font-size:10px;font-weight:600;">SPECULATIVE ${arch.tag.toUpperCase()}</span>
    <span style="color:#94a3b8;font-size:11px;">Jev Score: ${score}</span>
  </div>
  <h4 style="margin:0 0 6px;font-size:14px;">${arch.lens.split("(")[0].trim()}</h4>
  <p style="margin:0 0 10px;color:#94a3b8;font-size:11.5px;">Prompt: ${prompt || "Parallel UI exploration"} (${err.message.slice(0, 60)})</p>
  <div style="display:flex;gap:6px;">
    <button onclick="window.parent.postMessage({type:'asterism:commit-branch', nodeId:'${nodeId}'}, '*')" style="flex:1;background:${arch.btnColor};color:white;border:none;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;">✓ Keep Fork</button>
    <button onclick="window.parent.postMessage({type:'asterism:advance-stage', nodeId:'${nodeId}'}, '*')" style="flex:1;background:rgba(16,185,129,0.2);color:#34d399;border:1px solid rgba(16,185,129,0.4);padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;">🚂 Advance →</button>
  </div>
</div>`
        };
      }
    })
  );

  return results;
}

export async function advanceNodeStage({ sourceNode, targetStage, instruction }) {
  const nextStage = targetStage || nextStageFor(sourceNode.stage || "note");
  const nodeId = `node-${nextStage}-${Date.now()}`;

  const stageDirectives = {
    brainstorm: "Expand this note into 3 concrete, interactive concept directions with toggleable tabs or cards.",
    refine: "Distill this concept into a crisp technical & UX specification with interactive constraint sliders, architecture trade-offs, and deterministic acceptance checks.",
    design: "Build a high-fidelity interactive UI/UX mockup for this specification with working controls, state toggles, and visual polish.",
    implement: "Produce an executable implementation card: include a live working widget/component preview AND a toggleable code/verification panel showing test status and deployment readiness."
  };

  const directive = instruction || stageDirectives[nextStage] || stageDirectives.design;

  let html;
  try {
    html = await mutateHtmlSurface({
      currentHtml: sourceNode.html,
      title: `${sourceNode.title} -> ${nextStage.toUpperCase()}`,
      instruction: `Advance this surface along the Innovation Train from stage "${sourceNode.stage || "note"}" to stage "${nextStage}".
Directive: ${directive}
Include a header pill showing stage "${nextStage.toUpperCase()}" and a button at the bottom with onclick="window.parent.postMessage({type:'asterism:advance-stage', nodeId:'${nodeId}'}, '*')" to continue the train.`,
      model: sourceNode.model || DEFAULT_MODEL
    });
  } catch {
    html = `<div style="font-family:system-ui,sans-serif;padding:14px;color:#e2e8f0;font-size:12px;">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
    <span style="background:rgba(16,185,129,0.18);color:#34d399;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700;">STAGE: ${nextStage.toUpperCase()}</span>
    <span style="color:#94a3b8;font-size:11px;">From: ${sourceNode.branchTag || sourceNode.id}</span>
  </div>
  <h4 style="margin:0 0 6px;font-size:14px;">${sourceNode.title} (${nextStage})</h4>
  <p style="margin:0 0 10px;color:#94a3b8;font-size:11.5px;">${directive}</p>
  <button onclick="window.parent.postMessage({type:'asterism:advance-stage', nodeId:'${nodeId}'}, '*')" style="width:100%;background:#059669;color:white;border:none;padding:7px 10px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;">🚂 Advance to Next Stage →</button>
</div>`;
  }

  return {
    id: nodeId,
    title: `${ nextStage.charAt(0).toUpperCase() + nextStage.slice(1) }: ${sourceNode.title.replace(/^(Branch [A-Z]:|Speculative fork-[A-Z]:|Seed Note:)\s*/i, "")}`,
    kind: "surface",
    stage: nextStage,
    x: sourceNode.x + sourceNode.width + 95,
    y: sourceNode.y,
    width: 390,
    height: 310,
    model: sourceNode.model || DEFAULT_MODEL,
    status: "committed",
    branchTag: nextStage,
    parentId: sourceNode.id,
    html
  };
}
