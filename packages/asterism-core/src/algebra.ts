import * as Schema from "effect/Schema";

/**
 * 1. Stratum: 4-Element Diamond Refinement Lattice
 *    Intent (Why) -> { Spec (Universal Law / ∀), Prototype (Existential Sample / ∃) } -> World (Empirical Worktree)
 */
export const Stratum = Schema.Literals(["intent", "spec", "prototype", "world"]);
export type Stratum = typeof Stratum.Type;

/**
 * 2. Warrant (Alethic / Evidential Grounding — mirrors Hydro.Predicate ANoul & PCheck)
 *    Separates pass probability from epistemic ignorance (`abstain`).
 */
export const Warrant = Schema.Union([
  Schema.Struct({
    _tag: Schema.Literal("Open"),
    pass: Schema.optional(Schema.Number),
    abstain: Schema.optional(Schema.Number),
  }),
  Schema.Struct({
    _tag: Schema.Literal("Judged"),
    pass: Schema.Number,
    abstain: Schema.Number,
    statement: Schema.String,
    evidenceStepIds: Schema.optional(Schema.Array(Schema.Number)),
  }),
  Schema.Struct({
    _tag: Schema.Literal("Checked"),
    checkSpec: Schema.String,
    passed: Schema.Boolean,
    stepId: Schema.optional(Schema.Number),
  }),
]);
export type Warrant = typeof Warrant.Type;

/**
 * 3. Commitment (Deontic / Control-Flow Status — mirrors Hydro.Fork)
 */
export const Commitment = Schema.Literals([
  "speculative",
  "committed",
  "refuted",
  "archived",
]);
export type Commitment = typeof Commitment.Type;

/**
 * 4. Crystallization Optic Mode (Lens over 1 or N Thoughts)
 *    `Contract` is NOT a node coordinate; it is a lens projection over a Thought.
 */
export const OpticMode = Schema.Literals(["observe", "steer", "exhibit"]);
export type OpticMode = typeof OpticMode.Type;

/**
 * 5. Facet Key on a Thought Card (`[💬 Steer | 📐 Spec | 🎨 UI | ⚙ Code]`)
 */
export const FacetKey = Schema.Literals([
  "dialogue",
  "spec-diagram",
  "ui-prototype",
  "artifact-harness",
]);
export type FacetKey = typeof FacetKey.Type;

/**
 * 6. Two-Law Metabolic Energy Model:
 *    - Downward Attenuation: prevents single-run combinatorial runaway (`remainingTokens`, `maxDepth`, `remainingWorktreeLeases`).
 *    - Basal Metabolic Floor (Free-Energy Reservoir): a system-wide non-zero floor of "effective free" compute
 *      (`basalFloorTokensPerTick`) that continuously drips into exhausted/high-entropy frontier directions so the
 *      system NEVER deadlocks waiting for a human Steer when free compute can still buy positive Value of Information.
 */
export interface EnergyEnvelope {
  readonly remainingTokens: number;
  readonly maxDepth: number;
  readonly remainingWorktreeLeases: number;
  readonly basalRechargedTokens: number;
  readonly lastBasalTickAt?: string;
}

export interface BasalReservoirConfig {
  readonly basalFloorTokensPerTick: number;
  readonly minNodeEnergyFloor: number;
  readonly attenuationGamma: number;
}

export const DEFAULT_BASAL_CONFIG: BasalReservoirConfig = {
  basalFloorTokensPerTick: 2400,
  minNodeEnergyFloor: 400,
  attenuationGamma: 0.85,
};

export function createDefaultEnergyEnvelope(
  overrides: Partial<EnergyEnvelope> = {},
): EnergyEnvelope {
  return {
    remainingTokens: overrides.remainingTokens ?? 3600,
    maxDepth: overrides.maxDepth ?? 5,
    remainingWorktreeLeases: overrides.remainingWorktreeLeases ?? 2,
    basalRechargedTokens: overrides.basalRechargedTokens ?? 0,
    ...(overrides.lastBasalTickAt ? { lastBasalTickAt: overrides.lastBasalTickAt } : {}),
  };
}

/**
 * Downward attenuation when a parent thought expands (`Δ`) into `branchCount` children.
 * Enforces `minNodeEnergyFloor` if the Basal Free-Energy Floor is active.
 */
export function attenuateEnergyForBranches(
  parent: EnergyEnvelope,
  branchCount: number,
  config: BasalReservoirConfig = DEFAULT_BASAL_CONFIG,
): EnergyEnvelope {
  const k = Math.max(1, branchCount);
  const attenuated = Math.floor(
    (config.attenuationGamma * parent.remainingTokens) / k,
  );
  return {
    remainingTokens: Math.max(config.minNodeEnergyFloor, attenuated),
    maxDepth: Math.max(0, parent.maxDepth - 1),
    remainingWorktreeLeases: Math.max(0, parent.remainingWorktreeLeases),
    basalRechargedTokens: parent.basalRechargedTokens,
    lastBasalTickAt: new Date().toISOString(),
  };
}

/**
 * Computes the binary Shannon entropy H(p) in [0, 1] for a pass probability p in [0, 1].
 */
export function binaryEntropy(p: number): number {
  const clamped = Math.min(0.9999, Math.max(0.0001, p));
  return (
    -(
      clamped * Math.log2(clamped) +
      (1 - clamped) * Math.log2(1 - clamped)
    ) || 0
  );
}

/**
 * Extracts `(pass, abstain)` from any Warrant or legacy `jevScore` field.
 */
export function normalizeWarrant(node: {
  readonly warrant?: Warrant;
  readonly jevScore?: number;
  readonly implementation?: { readonly testPassed?: boolean } | null;
}): {
  readonly warrant: Warrant;
  readonly pass: number;
  readonly abstain: number;
} {
  if (node.warrant) {
    if (node.warrant._tag === "Open") {
      return {
        warrant: node.warrant,
        pass: node.warrant.pass ?? 0.5,
        abstain: node.warrant.abstain ?? 1.0,
      };
    }
    if (node.warrant._tag === "Judged") {
      return {
        warrant: node.warrant,
        pass: node.warrant.pass,
        abstain: node.warrant.abstain,
      };
    }
    return {
      warrant: node.warrant,
      pass: node.warrant.passed ? 1.0 : 0.0,
      abstain: 0.0,
    };
  }

  if (node.implementation && typeof node.implementation.testPassed === "boolean") {
    const warrant: Warrant = {
      _tag: "Checked",
      checkSpec: "node --test",
      passed: node.implementation.testPassed,
    };
    return {
      warrant,
      pass: node.implementation.testPassed ? 1.0 : 0.0,
      abstain: 0.0,
    };
  }

  if (typeof node.jevScore === "number") {
    const pass = Math.min(1, Math.max(0, node.jevScore));
    const abstain = Math.max(0.08, Math.round((1 - Math.abs(pass - 0.5) * 1.4) * 100) / 100);
    const warrant: Warrant = {
      _tag: "Judged",
      pass,
      abstain,
      statement: "Calibrated Jev viability evaluation",
    };
    return { warrant, pass, abstain };
  }

  return {
    warrant: { _tag: "Open", pass: 0.5, abstain: 0.85 },
    pass: 0.5,
    abstain: 0.85,
  };
}

/**
 * Information-Theoretic Expected Value of Information (EVOI) Attention Bid:
 *   AttentionBid(T, Optic) = Importance(T) * (p_abstain(T) + H(p_pass(T))) / (EstHumanSeconds(Optic) + SwitchCost)
 */
export function computeAttentionBid(input: {
  readonly warrant?: Warrant;
  readonly jevScore?: number;
  readonly opticMode?: OpticMode;
  readonly downstreamCount?: number;
  readonly commitment?: Commitment;
}): {
  readonly evoiScore: number;
  readonly epistemicEntropy: number;
  readonly pass: number;
  readonly abstain: number;
  readonly estimatedHumanSeconds: number;
} {
  const { pass, abstain } = normalizeWarrant(input);
  const entropy = binaryEntropy(pass);
  const epistemicLeverage = abstain + entropy;
  const importance = 1 + Math.min(4, (input.downstreamCount ?? 0) * 0.5);
  const mode = input.opticMode ?? "steer";
  const estimatedHumanSeconds =
    mode === "observe" ? 4 : mode === "steer" ? 15 : 45;
  const switchCost = 6;
  const raw =
    (importance * epistemicLeverage * 10) /
    (estimatedHumanSeconds + switchCost);
  const evoiScore = Math.round(raw * 100) / 100;

  return {
    evoiScore,
    epistemicEntropy: Math.round(epistemicLeverage * 100) / 100,
    pass,
    abstain,
    estimatedHumanSeconds,
  };
}

/**
 * Allocates excess "effective free" Basal Metabolic Energy (`basalFloorTokensPerTick`)
 * across nodes in the graph—prioritizing directions that have exhausted their envelope
 * (`remainingTokens <= minNodeEnergyFloor`) or have high Expected Value of Information (EVOI),
 * so the system never stalls waiting for a human Steer when free compute can make progress.
 */
export function allocateBasalFreeEnergy<
  T extends {
    readonly id: string;
    readonly title?: string;
    readonly commitment?: Commitment;
    readonly status?: string;
    readonly warrant?: Warrant;
    readonly jevScore?: number;
    readonly energy?: EnergyEnvelope;
  },
>(
  nodes: ReadonlyArray<T>,
  config: BasalReservoirConfig = DEFAULT_BASAL_CONFIG,
): {
  readonly allocations: ReadonlyArray<{
    readonly nodeId: string;
    readonly grantedTokens: number;
    readonly newRemainingTokens: number;
    readonly evoiScore: number;
    readonly reason: string;
  }>;
  readonly totalGrantedTokens: number;
} {
  const eligible = nodes.filter(
    (n) => n.commitment !== "refuted" && n.commitment !== "archived",
  );
  if (eligible.length === 0) {
    return { allocations: [], totalGrantedTokens: 0 };
  }

  const scored = eligible.map((node) => {
    const env = node.energy ?? createDefaultEnergyEnvelope();
    const bid = computeAttentionBid({
      ...(node.warrant ? { warrant: node.warrant } : {}),
      ...(typeof node.jevScore === "number" ? { jevScore: node.jevScore } : {}),
      ...(node.commitment ? { commitment: node.commitment } : {}),
    });
    const deficitFactor =
      env.remainingTokens <= config.minNodeEnergyFloor
        ? 2.5
        : env.remainingTokens < 1200
          ? 1.5
          : 0.6;
    const weight = Math.max(0.1, bid.evoiScore * deficitFactor);
    return { node, env, bid, weight };
  });

  const totalWeight = scored.reduce((acc, s) => acc + s.weight, 0);
  const now = new Date().toISOString();
  let totalGrantedTokens = 0;

  const allocations = scored.map(({ node, env, bid, weight }) => {
    const share = Math.max(
      120,
      Math.round((weight / totalWeight) * config.basalFloorTokensPerTick),
    );
    totalGrantedTokens += share;
    const newRemainingTokens = env.remainingTokens + share;
    const reason =
      env.remainingTokens <= config.minNodeEnergyFloor
        ? "Replenished exhausted envelope from Basal Free-Energy Floor"
        : "Allocated excess free energy to high-EVOI frontier";
    return {
      nodeId: node.id,
      grantedTokens: share,
      newRemainingTokens,
      evoiScore: bid.evoiScore,
      reason,
      updatedEnvelope: {
        ...env,
        remainingTokens: newRemainingTokens,
        basalRechargedTokens: (env.basalRechargedTokens ?? 0) + share,
        lastBasalTickAt: now,
      },
    };
  });

  return { allocations, totalGrantedTokens };
}

/**
 * Minimization of Regret (Evergreen / Persistent Branching Semantics):
 *
 * Acting on an upstream node with Downstream timelines MUST NOT destructively invalidate or cancel
 * existing downstream futures by default (`editIntent = "branch"`).
 *Instead:
 *  - If `node` has downstream dependents and `editIntent !== "in-place"`, we fork a new sibling revision
 *    timeline so the existing future remains 100% intact and playable ("minimization of regret").
 *  - Even if `editIntent === "in-place"`, we snapshot the prior revision in `node.revisions[]` and never
 *    hard-cancel running downstream worktrees—we merely attach an optional `upstreamRevisionAvailable`
 *    notice so downstream branches can pull the update if and when desired.
 */
export type EditIntent = "auto-branch" | "branch" | "in-place";

export interface RevisionSnapshot {
  readonly revision: number;
  readonly timestamp: string;
  readonly title: string;
  readonly html: string;
  readonly state: Record<string, unknown>;
  readonly instruction?: string;
}

export function shouldBranchForRegretMinimization(input: {
  readonly nodeId: string;
  readonly edges: ReadonlyArray<{ readonly from: string; readonly to: string }>;
  readonly editIntent?: EditIntent;
}): boolean {
  if (input.editIntent === "branch") return true;
  if (input.editIntent === "in-place") return false;
  // Default ("auto-branch"): if this node has ANY downstream children in the graph,
  // branching into an additional future preserves the existing downstream train without regret!
  const hasDownstream = input.edges.some((e) => e.from === input.nodeId);
  return hasDownstream;
}

/**
 * 7. Combinatorial Ideonomy Axes & Matchmaker Cross-Pollination (`Expand Δ` + `Couple ⋈`)
 */
export interface IdeonomyAxis {
  readonly id: string;
  readonly label: string;
  readonly stance: "ideonomist" | "advocate" | "critic" | "matchmaker";
  readonly operator: "expand" | "couple" | "verify" | "translate";
  readonly promptTemplate: string;
}

export const DEFAULT_IDEONOMY_AXES: ReadonlyArray<IdeonomyAxis> = [
  {
    id: "inversion-zero-ui",
    label: "Inversion × Ambient / Zero-Friction",
    stance: "ideonomist",
    operator: "expand",
    promptTemplate:
      "Invert the primary interaction assumption: make it ambient, proactive, and zero-friction",
  },
  {
    id: "steelman-prototype",
    label: "Advocate × Concrete Interactive Specimen",
    stance: "advocate",
    operator: "translate",
    promptTemplate:
      "Steelman the seed idea with a concrete, tactile UI prototype & interactive controls",
  },
  {
    id: "redteam-invariant",
    label: "Critic / Red-Teamer × Failure-Mode Stress Test",
    stance: "critic",
    operator: "verify",
    promptTemplate:
      "Probe failure modes, edge-case bottlenecks, and formal invariants that could break this idea",
  },
];

/**
 * Computes lexical + semantic-token Jaccard/overlap affinity between a seed thought and
 * existing nodes in the Brain graph so the Matchmaker stance can discover distant Jump links
 * and propose `⊕ Synthesis` hybrids.
 */
export function rankMatchmakerCandidates<
  T extends {
    readonly id: string;
    readonly title?: string;
    readonly branchTag?: string;
    readonly stage?: string;
    readonly surfaceRole?: string;
    readonly state?: Record<string, unknown>;
    readonly html?: string;
  },
>(
  seedText: string,
  existingNodes: ReadonlyArray<T>,
  excludeIds: ReadonlySet<string> = new Set(),
): ReadonlyArray<{
  readonly node: T;
  readonly affinityScore: number;
  readonly sharedConcepts: ReadonlyArray<string>;
}> {
  const tokenize = (txt: string): Set<string> => {
    const stop = new Set([
      "the",
      "and",
      "for",
      "with",
      "that",
      "this",
      "from",
      "into",
      "panel",
      "node",
      "surface",
      "style",
      "div",
      "span",
      "class",
      "rgba",
      "font",
      "color",
    ]);
    return new Set(
      txt
        .toLowerCase()
        .replace(/<[^>]+>/g, " ")
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 3 && !stop.has(w)),
    );
  };

  const seedTokens = tokenize(seedText);
  return existingNodes
    .filter((n) => !excludeIds.has(n.id))
    .map((node) => {
      const nodeCorpus = [
        node.title || "",
        node.branchTag || "",
        node.stage || "",
        node.surfaceRole || "",
        JSON.stringify(node.state || {}),
      ].join(" ");
      const nodeTokens = tokenize(nodeCorpus);
      const shared: string[] = [];
      for (const tok of seedTokens) {
        if (nodeTokens.has(tok)) shared.push(tok);
      }
      // Base structural diversity bonus (coupling an Intent/Dialogue with a World/Artifact or Spec)
      const diversityBonus =
        node.surfaceRole === "artifact-harness"
          ? 0.28
          : node.surfaceRole === "spec-diagram"
            ? 0.24
            : 0.18;
      const overlap =
        seedTokens.size > 0
          ? shared.length / Math.sqrt(seedTokens.size * Math.max(1, nodeTokens.size))
          : 0;
      const affinityScore =
        Math.round(Math.min(0.98, diversityBonus + overlap * 1.35) * 100) / 100;
      return {
        node,
        affinityScore,
        sharedConcepts: shared.slice(0, 5),
      };
    })
    .sort((a, b) => b.affinityScore - a.affinityScore);
}

