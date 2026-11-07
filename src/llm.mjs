const LLM_BASE_URL = process.env.ASTERISM_LLM_URL || "https://llm.int.exe.xyz";
const DEFAULT_MODEL = process.env.ASTERISM_MODEL || "openai/gpt-6-luna";

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
  const systemInstructions = `You are an expert UI/UX co-design agent inside Asterism, an infinite spatial canvas where every session is a live, malleable HTML surface.
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
Include a top badge saying "SPECULATIVE ${arch.tag.toUpperCase()}" and a Jev Score of ${score}, plus a button at the bottom with:
onclick="window.parent.postMessage({type:'asterism:commit-branch', nodeId:'${nodeId}'}, '*')"
labeled "✓ Keep ${arch.tag}".`,
          model: sourceNode.model || DEFAULT_MODEL
        });
        return {
          id: nodeId,
          title: `Speculative ${arch.tag}: ${arch.lens.split("(")[0].trim()}`,
          kind: "speculative",
          x: sourceNode.x + sourceNode.width + 90,
          y: sourceNode.y + (idx - 1) * 285,
          width: 380,
          height: 265,
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
          x: sourceNode.x + sourceNode.width + 90,
          y: sourceNode.y + (idx - 1) * 285,
          width: 380,
          height: 265,
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
  <button onclick="window.parent.postMessage({type:'asterism:commit-branch', nodeId:'${nodeId}'}, '*')" style="background:${arch.btnColor};color:white;border:none;padding:6px 12px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;width:100%;">✓ Keep ${arch.tag}</button>
</div>`
        };
      }
    })
  );

  return results;
}
