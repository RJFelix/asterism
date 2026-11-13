import * as Schema from "effect/Schema";

/**
 * State Reachability (Ergodicity vs. Irreversible Sink Transitions):
 * - "ergodic": Path LRR reaches the same state equivalence class as R up to finite transition cost
 *   (`reversalCostTokens`). Examples: Git worktree experiments, UI prototypes, Reversible arm motions.
 * - "irreversible": Enters a non-communicating basin / external world commitment where the prior
 *   reachable state set cannot be recovered.
 */
export const StateReachability = Schema.Literals(["ergodic", "irreversible"]);
export type StateReachability = typeof StateReachability.Type;

export interface PreferenceHypothesis {
  readonly id: string;
  readonly statement: string;
  readonly scopeProjectId: string; // "global" or specific project id
  readonly polarity: "positive" | "negative";
  readonly weight: number; // [-1, 1] strength of belief
  readonly confidence: number; // [0, 1] internal epistemic confidence
  readonly empiricalHits: number;
  readonly empiricalTrials: number;
  readonly brierSum: number;
  readonly usesSinceLastProbe: number;
  readonly status: "active" | "refuted";
  readonly updatedAt: string;
}

export interface ProjectEconomicProfile {
  readonly projectId: string;
  readonly label: string;
  /** Utility cost per $1 of marginal cloud/GPU spend */
  readonly dollarCostWeight: number;
  /** Utility cost per 1,000 tokens above the basal free-energy floor */
  readonly kTokenCostWeight: number;
  /** Attention / interruption cost of surfacing a decision card right now */
  readonly askInterruptionCost: number;
  /** Opportunity / blocking cost of waiting on operator input before proceeding */
  readonly waitLatencyCost: number;
  /** Already-paid / basal free-energy floor tokens available per decision step */
  readonly basalFreeTokens: number;
}

export interface DecisionCandidate {
  readonly id: string;
  readonly label: string;
  readonly summary: string;
  /** Prior mean utility relative to status-quo ∅ = 0 */
  readonly baseUtilityMean: number;
  /** Epistemic uncertainty (std dev) over how much the user values this outcome */
  readonly utilityStd: number;
  readonly tokenCost: number;
  readonly dollarCost: number;
  readonly reachability: StateReachability;
  readonly reversalCostTokens: number;
  /** Hypothesis IDs that predict the user favors (+) or disfavors (-) this candidate */
  readonly supportingHypothesisIds: ReadonlyArray<string>;
  /**
   * Portfolio interaction with sibling candidates in [-1, +0.5]:
   *   0.0  = independent / additive fruitful experiments (U({a,b}) = U(a) + U(b))
   *  +0.25 = superadditive synthesis potential (U({a,b}) > U(a) + U(b))
   *  -0.85 = redundant / substitutable tournament variants (U({a,b}) ≈ max(U(a), U(b)))
   */
  readonly portfolioInteraction: number;
  /** True only when two options physically cannot co-exist in the same state basin */
  readonly mutuallyExclusiveWith?: ReadonlyArray<string>;
}

export type PolicyRegime =
  | "co-fork"
  | "act-single"
  | "abstain-neither"
  | "ask-regret"
  | "probe-calibration";

export interface SubsetEvaluation {
  readonly subsetKey: string; // e.g. "∅", "opt-a", "opt-a+opt-b"
  readonly optionIds: ReadonlyArray<string>;
  readonly expectedNetUtility: number;
  readonly winProbability: number;
  readonly marginalResourceCost: number;
  readonly feasible: boolean;
}

export interface SealedPrediction {
  readonly id: string;
  readonly nodeId?: string;
  readonly prompt: string;
  readonly projectId: string;
  readonly regime: PolicyRegime;
  readonly candidateIds: ReadonlyArray<string>;
  readonly predictedSubsetKey: string;
  readonly predictedOptionIds: ReadonlyArray<string>;
  readonly subsetProbabilities: Record<string, number>;
  readonly expectedRegretOfActing: number;
  readonly calibrationValue: number;
  readonly askThresholdCost: number;
  readonly supportingHypothesisIds: ReadonlyArray<string>;
  readonly createdAt: string;
  readonly resolvedAt?: string;
  readonly chosenOptionIds?: ReadonlyArray<string>;
  readonly chosenSubsetKey?: string;
  readonly brierScore?: number;
  readonly accurate?: boolean;
  readonly calibrationNote?: string;
}

export interface UserModelState {
  readonly version: number;
  readonly hypotheses: ReadonlyArray<PreferenceHypothesis>;
  readonly economicProfiles: Record<string, ProjectEconomicProfile>;
  readonly sealedPredictions: ReadonlyArray<SealedPrediction>;
}

export function subsetKeyFor(optionIds: ReadonlyArray<string>): string {
  if (!optionIds || optionIds.length === 0) return "∅";
  return [...optionIds].sort().join("+");
}

export function createDefaultUserModel(): UserModelState {
  const now = new Date().toISOString();
  return {
    version: 1,
    hypotheses: [
      {
        id: "hyp-calm-zero-chrome",
        statement: "Prefers calm, low-chrome surfaces that expose only active decisions and living artifacts rather than orchestration toolbars.",
        scopeProjectId: "global",
        polarity: "positive",
        weight: 0.88,
        confidence: 0.86,
        empiricalHits: 7,
        empiricalTrials: 8,
        brierSum: 0.42,
        usesSinceLastProbe: 1,
        status: "active",
        updatedAt: now,
      },
      {
        id: "hyp-cofork-basal",
        statement: "Favors pursuing multiple non-exclusive experiments in parallel when covered by basal compute rather than forcing premature 1-of-k choices.",
        scopeProjectId: "global",
        polarity: "positive",
        weight: 0.91,
        confidence: 0.88,
        empiricalHits: 6,
        empiricalTrials: 6,
        brierSum: 0.18,
        usesSinceLastProbe: 2,
        status: "active",
        updatedAt: now,
      },
      {
        id: "hyp-global-misc-repo",
        statement: "Prefers unblocked execution in a global 'anything goes' misc repo over per-card file/repository configuration prompts.",
        scopeProjectId: "proj-misc-attic",
        polarity: "positive",
        weight: 0.92,
        confidence: 0.9,
        empiricalHits: 5,
        empiricalTrials: 5,
        brierSum: 0.12,
        usesSinceLastProbe: 1,
        status: "active",
        updatedAt: now,
      },
      {
        id: "hyp-work-latency-over-dollars",
        statement: "In active engineering sprints, values avoiding wait-time latency over moderate cloud/compute spend ($1-$100).",
        scopeProjectId: "proj-asterism",
        polarity: "positive",
        weight: 0.76,
        confidence: 0.62,
        empiricalHits: 2,
        empiricalTrials: 3,
        brierSum: 0.48,
        usesSinceLastProbe: 5,
        status: "active",
        updatedAt: now,
      },
    ],
    economicProfiles: {
      "proj-misc-attic": {
        projectId: "proj-misc-attic",
        label: "Exploratory / Misc Attic",
        dollarCostWeight: 0.45,
        kTokenCostWeight: 0.08,
        askInterruptionCost: 3.2,
        waitLatencyCost: 1.8,
        basalFreeTokens: 4800,
      },
      "proj-asterism": {
        projectId: "proj-asterism",
        label: "Active Sprint / Core Repo",
        dollarCostWeight: 0.08, // $100 is relatively cheap vs blocking sprint flow
        kTokenCostWeight: 0.04,
        askInterruptionCost: 4.5,
        waitLatencyCost: 5.5,
        basalFreeTokens: 6400,
      },
    },
    sealedPredictions: [],
  };
}

/**
 * Computes empirical calibration discount in [0.35, 1.0]:
 * A model claiming 90% confidence is tempered if its empirical Brier / hit-rate on cited hypotheses is poor or untested.
 */
export function computeEmpiricalCalibrationFactor(
  hypotheses: ReadonlyArray<PreferenceHypothesis>,
): {
  readonly calibrationFactor: number;
  readonly meanBrier: number;
  readonly stalenessScore: number;
} {
  const active = hypotheses.filter((h) => h.status === "active");
  if (active.length === 0) {
    return { calibrationFactor: 0.5, meanBrier: 0.25, stalenessScore: 1.0 };
  }
  let totalTrials = 0;
  let totalBrier = 0;
  let maxStaleness = 0;
  for (const h of active) {
    totalTrials += h.empiricalTrials;
    totalBrier += h.brierSum;
    const trialScarcity = h.empiricalTrials < 3 ? 1.4 : 1.0;
    maxStaleness = Math.max(maxStaleness, h.usesSinceLastProbe * 0.22 * trialScarcity);
  }
  const meanBrier = totalTrials > 0 ? totalBrier / totalTrials : 0.25;
  // Brier 0.0 -> factor 1.0; Brier 0.35 -> factor ~0.55
  const evidenceWeight = Math.min(1, totalTrials / (totalTrials + 3));
  const rawAccuracy = Math.max(0.35, 1 - meanBrier * 1.3);
  const calibrationFactor = Number(
    (0.55 * (1 - evidenceWeight) + rawAccuracy * evidenceWeight).toFixed(3),
  );
  return {
    calibrationFactor,
    meanBrier: Number(meanBrier.toFixed(3)),
    stalenessScore: Number(Math.min(2.5, maxStaleness).toFixed(3)),
  };
}

/**
 * Deterministic low-discrepancy standard normal quantile approximation (Halton base-2/3 + Acklam/probit)
 * so power-set expected regret integration over P(A) is fast, exact-reproducible, and dependency-free.
 */
function halton(index: number, base: number): number {
  let result = 0;
  let f = 1 / base;
  let i = index;
  while (i > 0) {
    result += f * (i % base);
    i = Math.floor(i / base);
    f /= base;
  }
  return result;
}

function approxInvNormal(u: number): number {
  const p = Math.min(0.999, Math.max(0.001, u));
  // Moro / Hastings rational approximation
  const t = p < 0.5 ? Math.sqrt(-2 * Math.log(p)) : Math.sqrt(-2 * Math.log(1 - p));
  const c0 = 2.515517;
  const c1 = 0.802853;
  const c2 = 0.010328;
  const d1 = 1.432788;
  const d2 = 0.189269;
  const d3 = 0.001308;
  const z = t - (c0 + c1 * t + c2 * t * t) / (1 + d1 * t + d2 * t * t + d3 * t * t * t);
  return p < 0.5 ? -z : z;
}

const PRIMES = [2, 3, 5, 7, 11, 13, 17, 19];

/**
 * Evaluates the full Power Set P(A) (including ∅ = "Neither" and multi-element subsets = "Co-Fork / Both")
 * under Basal Free-Energy, State Reachability (ergodic vs. irreversible), and User Model calibration.
 */
export function evaluatePowerSetPolicy(input: {
  readonly prompt: string;
  readonly candidates: ReadonlyArray<DecisionCandidate>;
  readonly userModel: UserModelState;
  readonly projectId?: string;
  /** Viewport zoom/focus scale: zoomed-in focus lowers local interruption cost; zoomed-out raises it */
  readonly attentionalAltitudeScale?: number;
  readonly nodeId?: string;
}): {
  readonly regime: PolicyRegime;
  readonly bestSubset: SubsetEvaluation;
  readonly subsets: ReadonlyArray<SubsetEvaluation>;
  readonly expectedRegretOfActing: number;
  readonly calibrationValue: number;
  readonly effectiveAskCost: number;
  readonly sealedPrediction: SealedPrediction;
} {
  const k = Math.min(input.candidates.length, 6);
  const candidates = input.candidates.slice(0, k);
  const projectId = input.projectId || "proj-misc-attic";
  const profile =
    input.userModel.economicProfiles[projectId] ||
    input.userModel.economicProfiles["proj-misc-attic"] || {
      projectId,
      label: "Default",
      dollarCostWeight: 0.35,
      kTokenCostWeight: 0.06,
      askInterruptionCost: 3.2,
      waitLatencyCost: 2.0,
      basalFreeTokens: 4800,
    };

  // Zoomed-in focus means the human is already looking here (lower interruption cost);
  // zoomed-out ambient view raises interruption cost.
  const zoomScale = input.attentionalAltitudeScale ?? 0.88;
  const focusMultiplier = zoomScale >= 1.15 ? 0.65 : zoomScale <= 0.65 ? 1.45 : 1.0;
  const effectiveAskCost = Number(
    ((profile.askInterruptionCost + profile.waitLatencyCost * 0.5) * focusMultiplier).toFixed(3),
  );

  const activeHyps = new Map(
    input.userModel.hypotheses
      .filter((h) => h.status === "active" && (h.scopeProjectId === "global" || h.scopeProjectId === projectId))
      .map((h) => [h.id, h]),
  );

  const citedHypSet = new Set<string>();
  const adjustedCandidates = candidates.map((c) => {
    let hypBoost = 0;
    for (const hid of c.supportingHypothesisIds) {
      const h = activeHyps.get(hid);
      if (h) {
        citedHypSet.add(h.id);
        const sign = h.polarity === "negative" ? -1 : 1;
        hypBoost += sign * h.weight * h.confidence * 1.6;
      }
    }
    return { c, mean: c.baseUtilityMean + hypBoost };
  });

  const citedHyps = [...citedHypSet]
    .map((id) => activeHyps.get(id))
    .filter((h): h is PreferenceHypothesis => Boolean(h));
  const calib = computeEmpiricalCalibrationFactor(
    citedHyps.length > 0 ? citedHyps : input.userModel.hypotheses,
  );

  // Enumerate all subsets S in P(A): 0 .. (2^k - 1)
  const rawSubsets: Array<{
    mask: number;
    optionIds: string[];
    subsetKey: string;
    feasible: boolean;
    marginalCost: number;
  }> = [];

  const totalMasks = 1 << k;
  for (let mask = 0; mask < totalMasks; mask++) {
    const selected: DecisionCandidate[] = [];
    for (let i = 0; i < k; i++) {
      if ((mask & (1 << i)) !== 0) selected.push(candidates[i]!);
    }

    // Check genuine non-communicating / hard mutual exclusivity
    let feasible = true;
    const idSet = new Set(selected.map((s) => s.id));
    for (const s of selected) {
      if (s.mutuallyExclusiveWith?.some((ex) => idSet.has(ex))) {
        feasible = false;
        break;
      }
    }

    // Resource cost above the Basal Free-Energy Floor!
    // Tokens within `basalFreeTokens` have 0 marginal cost—so idle basal energy naturally drives exploration.
    const totalTokens = selected.reduce((acc, s) => acc + s.tokenCost, 0);
    const billableTokens = Math.max(0, totalTokens - profile.basalFreeTokens);
    const totalDollars = selected.reduce((acc, s) => acc + s.dollarCost, 0);

    // Ergodic vs. Irreversible transition cost:
    // Ergodic actions (LRR === R) only risk tiny transition overhead; irreversible actions carry sink risk.
    const reversibilityRisk = selected.reduce((acc, s) => {
      if (s.reachability === "ergodic") {
        return acc + (s.reversalCostTokens / 1000) * profile.kTokenCostWeight * 0.25;
      }
      return acc + 1.85; // Irreversible sink commitment overhead
    }, 0);

    const marginalCost =
      (billableTokens / 1000) * profile.kTokenCostWeight +
      totalDollars * profile.dollarCostWeight +
      reversibilityRisk;

    const optionIds = selected.map((s) => s.id);
    rawSubsets.push({
      mask,
      optionIds,
      subsetKey: subsetKeyFor(optionIds),
      feasible,
      marginalCost: Number(marginalCost.toFixed(3)),
    });
  }

  // Quasi-Monte Carlo integration (96 Halton draws) over uncertain candidate utilities U ~ P_you(. | c)
  const N_DRAWS = 96;
  const sumUtility = new Array<number>(totalMasks).fill(0);
  const winCounts = new Array<number>(totalMasks).fill(0);
  let sumOracleMax = 0;

  // Temper uncertainty wider when empirical calibration is unproven
  const stdInflation = 1 / Math.max(0.45, calib.calibrationFactor);

  for (let d = 1; d <= N_DRAWS; d++) {
    const sampledSingleU = adjustedCandidates.map(({ c, mean }, idx) => {
      const u = halton(d, PRIMES[idx % PRIMES.length]!);
      const z = approxInvNormal(u);
      return mean + z * c.utilityStd * stdInflation;
    });

    let bestValThisDraw = -Infinity;
    let bestMaskThisDraw = 0;

    for (let m = 0; m < totalMasks; m++) {
      const sub = rawSubsets[m]!;
      if (!sub.feasible) continue;

      let netU = 0; // Status quo ∅ = 0! (Protects against negative-utility cat-food vs dog-food traps)
      if (m !== 0) {
        const chosenIndices: number[] = [];
        for (let i = 0; i < k; i++) {
          if ((m & (1 << i)) !== 0) chosenIndices.push(i);
        }

        if (chosenIndices.length === 1) {
          netU = sampledSingleU[chosenIndices[0]!]! - sub.marginalCost;
        } else {
          // Combine portfolio utility according to complementarity vs substitutability
          const vals = chosenIndices.map((idx) => sampledSingleU[idx]!);
          const avgInteraction =
            chosenIndices.reduce(
              (acc, idx) => acc + candidates[idx]!.portfolioInteraction,
              0,
            ) / chosenIndices.length;

          const additiveSum = vals.reduce((a, b) => a + b, 0);
          const maxSingle = Math.max(...vals);

          let combinedGross: number;
          if (avgInteraction < 0) {
            // Substitutable / redundant blend toward max(U(a), U(b))
            const wMax = Math.min(1, Math.abs(avgInteraction));
            combinedGross = wMax * maxSingle + (1 - wMax) * additiveSum;
          } else {
            // Complementary / superadditive co-fork!
            combinedGross = additiveSum * (1 + avgInteraction * 0.35);
          }
          netU = combinedGross - sub.marginalCost;
        }
      }

      sumUtility[m]! += netU;
      if (netU > bestValThisDraw) {
        bestValThisDraw = netU;
        bestMaskThisDraw = m;
      }
    }

    winCounts[bestMaskThisDraw]! += 1;
    sumOracleMax += bestValThisDraw;
  }

  const subsets: SubsetEvaluation[] = rawSubsets
    .map((sub, m) => ({
      subsetKey: sub.subsetKey,
      optionIds: sub.optionIds,
      expectedNetUtility: sub.feasible
        ? Number((sumUtility[m]! / N_DRAWS).toFixed(3))
        : -999,
      winProbability: sub.feasible
        ? Number((winCounts[m]! / N_DRAWS).toFixed(3))
        : 0,
      marginalResourceCost: sub.marginalCost,
      feasible: sub.feasible,
    }))
    .filter((s) => s.feasible)
    .sort((a, b) => b.expectedNetUtility - a.expectedNetUtility);

  const bestSubset = subsets[0]!;
  const expectedOracleMax = sumOracleMax / N_DRAWS;
  // Expected Regret of committing immediately to S* without asking the operator:
  //   R_act = E[max_S U(S)] - max_S E[U(S)] >= 0
  const expectedRegretOfActing = Number(
    Math.max(0, expectedOracleMax - bestSubset.expectedNetUtility).toFixed(3),
  );

  // Value of Calibration Spot-Check (V_calib):
  // High when supporting hypotheses have been auto-applied repeatedly without verification or have high Brier error.
  const stakesScale = Math.max(
    0.6,
    Math.min(3.0, Math.abs(bestSubset.expectedNetUtility) * 0.35 + 0.5),
  );
  const calibrationValue = Number(
    (calib.stalenessScore * (1.25 - calib.calibrationFactor * 0.65) * stakesScale * 2.2).toFixed(3),
  );

  let regime: PolicyRegime;
  if (expectedRegretOfActing > effectiveAskCost) {
    regime = "ask-regret";
  } else if (calibrationValue > effectiveAskCost) {
    regime = "probe-calibration";
  } else if (bestSubset.optionIds.length >= 2) {
    regime = "co-fork";
  } else if (bestSubset.optionIds.length === 1) {
    regime = "act-single";
  } else {
    regime = "abstain-neither";
  }

  const subsetProbabilities: Record<string, number> = {};
  for (const s of subsets) {
    subsetProbabilities[s.subsetKey] = s.winProbability;
  }

  const sealedPrediction: SealedPrediction = {
    id: `pred-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    ...(input.nodeId ? { nodeId: input.nodeId } : {}),
    prompt: input.prompt,
    projectId,
    regime,
    candidateIds: candidates.map((c) => c.id),
    predictedSubsetKey: bestSubset.subsetKey,
    predictedOptionIds: bestSubset.optionIds,
    subsetProbabilities,
    expectedRegretOfActing,
    calibrationValue,
    askThresholdCost: effectiveAskCost,
    supportingHypothesisIds: [...citedHypSet],
    createdAt: new Date().toISOString(),
  };

  return {
    regime,
    bestSubset,
    subsets,
    expectedRegretOfActing,
    calibrationValue,
    effectiveAskCost,
    sealedPrediction,
  };
}

/**
 * Increments `usesSinceLastProbe` when the system acts autonomously without asking,
 * ensuring silent assumptions eventually accumulate enough V_calib to be spot-checked.
 */
export function recordAutonomousActionOnUserModel(
  userModel: UserModelState,
  prediction: SealedPrediction,
): UserModelState {
  const cited = new Set(prediction.supportingHypothesisIds);
  const now = new Date().toISOString();
  const hypotheses = userModel.hypotheses.map((h) =>
    cited.has(h.id)
      ? { ...h, usesSinceLastProbe: h.usesSinceLastProbe + 1, updatedAt: now }
      : h,
  );
  const sealedPredictions = [prediction, ...userModel.sealedPredictions].slice(0, 60);
  return {
    ...userModel,
    hypotheses,
    sealedPredictions,
  };
}

/**
 * Scores a SealedPrediction against the operator's actual subset choice (`{A}`, `{B}`, `{Both}`, or `∅`),
 * computing proper multi-class Brier score and updating cited PreferenceHypotheses.
 */
export function scoreSealedPrediction(input: {
  readonly userModel: UserModelState;
  readonly predictionId: string;
  readonly chosenOptionIds: ReadonlyArray<string>;
}): {
  readonly updatedUserModel: UserModelState;
  readonly resolvedPrediction: SealedPrediction;
} {
  const pred = input.userModel.sealedPredictions.find(
    (p) => p.id === input.predictionId,
  );
  if (!pred) {
    throw new Error(`Sealed prediction not found: ${input.predictionId}`);
  }

  const actualKey = subsetKeyFor(input.chosenOptionIds);
  const keys = Object.keys(pred.subsetProbabilities);
  if (!keys.includes(actualKey)) keys.push(actualKey);

  // Multi-subset Brier score in [0, 1] (normalized by 2 so max error is 1.0)
  let sqSum = 0;
  for (const key of keys) {
    const p = pred.subsetProbabilities[key] ?? 0;
    const y = key === actualKey ? 1 : 0;
    sqSum += (p - y) * (p - y);
  }
  const brierScore = Number((sqSum / 2).toFixed(4));
  const accurate = pred.predictedSubsetKey === actualKey;
  const predictedProb = Math.round((pred.subsetProbabilities[pred.predictedSubsetKey] ?? 0) * 100);
  const now = new Date().toISOString();

  const calibrationNote = accurate
    ? `Confirmed pre-prediction (${pred.predictedSubsetKey} @ ${predictedProb}%) · Brier ${brierScore}`
    : `Updated priors: predicted ${pred.predictedSubsetKey} (${predictedProb}%), operator chose ${actualKey} · Brier ${brierScore}`;

  const resolvedPrediction: SealedPrediction = {
    ...pred,
    resolvedAt: now,
    chosenOptionIds: [...input.chosenOptionIds],
    chosenSubsetKey: actualKey,
    brierScore,
    accurate,
    calibrationNote,
  };

  const cited = new Set(pred.supportingHypothesisIds);
  const updatedHypotheses = input.userModel.hypotheses.map((h) => {
    if (!cited.has(h.id)) return h;
    const nextTrials = h.empiricalTrials + 1;
    const nextHits = h.empiricalHits + (accurate ? 1 : 0);
    const nextBrierSum = Number((h.brierSum + brierScore).toFixed(4));
    const nextConfidence = Number(
      Math.min(0.97, Math.max(0.18, accurate ? h.confidence + 0.06 : h.confidence - 0.16)).toFixed(3),
    );
    const nextWeight = Number(
      Math.min(1, Math.max(-1, accurate ? h.weight + 0.04 : h.weight - 0.14)).toFixed(3),
    );
    return {
      ...h,
      empiricalTrials: nextTrials,
      empiricalHits: nextHits,
      brierSum: nextBrierSum,
      confidence: nextConfidence,
      weight: nextWeight,
      usesSinceLastProbe: 0, // Freshly empirically tested!
      updatedAt: now,
    };
  });

  // Also adapt project interruption/resource profile if the operator explicitly chose Both vs Single vs Neither
  const updatedProfiles = { ...input.userModel.economicProfiles };
  const prof = updatedProfiles[pred.projectId];
  if (prof && !accurate) {
    if (input.chosenOptionIds.length >= 2 && pred.predictedOptionIds.length < 2) {
      // Operator preferred co-forking more aggressively than predicted -> lower marginal cost weight
      updatedProfiles[pred.projectId] = {
        ...prof,
        dollarCostWeight: Number(Math.max(0.02, prof.dollarCostWeight * 0.82).toFixed(3)),
        kTokenCostWeight: Number(Math.max(0.01, prof.kTokenCostWeight * 0.85).toFixed(3)),
      };
    } else if (input.chosenOptionIds.length < pred.predictedOptionIds.length) {
      updatedProfiles[pred.projectId] = {
        ...prof,
        dollarCostWeight: Number((prof.dollarCostWeight * 1.18).toFixed(3)),
      };
    }
  }

  const updatedPredictions = input.userModel.sealedPredictions.map((p) =>
    p.id === pred.id ? resolvedPrediction : p,
  );

  return {
    updatedUserModel: {
      ...input.userModel,
      hypotheses: updatedHypotheses,
      economicProfiles: updatedProfiles,
      sealedPredictions: updatedPredictions,
    },
    resolvedPrediction,
  };
}
