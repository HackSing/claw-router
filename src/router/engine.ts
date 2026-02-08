/**
 * @aiwaretop/claw-router — Routing Engine
 *
 * Orchestrates: overrides → scorer → sigmoid calibration → tier mapping → model selection.
 */

import {
  Tier, TIER_ORDER, Dimension,
  DEFAULT_WEIGHTS, DEFAULT_THRESHOLDS,
  type ScoreResult, type RouteDecision,
} from './types';
import type { ResolvedConfig } from '../config';
import { checkOverrides } from './overrides';
import { scoreDimensions } from './scorer';

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Route a message: determine tier and model.
 *
 * @param message  Raw user message
 * @param config   Resolved plugin config
 * @returns        RouteDecision (tier, model, score breakdown, latency)
 */
export function route(message: string, config: ResolvedConfig): RouteDecision {
  const t0 = performance.now();

  // 1. Hard-rule overrides
  const override = checkOverrides(message);
  if (override) {
    const score = buildOverrideScore(override.tier, override.rule);
    return finalize(score, config, t0);
  }

  // 2. 8-dimension scoring
  const dimensions = scoreDimensions(message, config.weights);
  const rawSum = dimensions.reduce((s, d) => s + d.weighted, 0);

  // 3. Calibration (stretches raw sum range into 0–1 for tier mapping)
  const calibrated = calibrate(rawSum);

  // 4. Map score → tier
  const tier = scoreToTier(calibrated, config.thresholds);

  const score: ScoreResult = { dimensions, rawSum, calibrated, tier };
  return finalize(score, config, t0);
}

/**
 * Convenience: score only (no model resolution). Useful for testing/debugging.
 */
export function scoreOnly(message: string, config: ResolvedConfig): ScoreResult {
  const override = checkOverrides(message);
  if (override) return buildOverrideScore(override.tier, override.rule);

  const dimensions = scoreDimensions(message, config.weights);
  const rawSum = dimensions.reduce((s, d) => s + d.weighted, 0);
  const calibrated = calibrate(rawSum);
  const tier = scoreToTier(calibrated, config.thresholds);
  return { dimensions, rawSum, calibrated, tier };
}

// ── Internals ───────────────────────────────────────────────────────────────

/**
 * Calibration function: stretches the raw weighted sum into a full 0–1 range.
 *
 * The raw weighted sum typically falls in [0, ~0.45] because:
 *   - Each dimension score is 0–1, multiplied by weight (sum of weights = 1)
 *   - Few messages max out every dimension simultaneously
 *
 * We use a power-curve calibration that maps the effective range [0, 0.50]
 * into [0, 1.0], providing good tier separation.
 */
function calibrate(x: number): number {
  // Linear stretch so 0.50 → 1.0, then power 0.75 for S-curve
  const stretched = Math.min(x / 0.50, 1.0);
  return Math.pow(stretched, 0.75);
}

/** Map calibrated score to a tier using configured thresholds. */
function scoreToTier(
  score: number,
  thresholds: [number, number, number, number] = DEFAULT_THRESHOLDS,
): Tier {
  if (score < thresholds[0]) return Tier.TRIVIAL;
  if (score < thresholds[1]) return Tier.SIMPLE;
  if (score < thresholds[2]) return Tier.MODERATE;
  if (score < thresholds[3]) return Tier.COMPLEX;
  return Tier.EXPERT;
}

/** Build a synthetic ScoreResult for override rules (no real scoring). */
function buildOverrideScore(tier: Tier, rule: string): ScoreResult {
  const dimensions = Object.values(Dimension).map(dim => ({
    dimension: dim,
    raw: 0,
    weight: DEFAULT_WEIGHTS[dim],
    weighted: 0,
  }));
  return {
    dimensions,
    rawSum: 0,
    calibrated: 0,
    tier,
    overrideApplied: rule,
  };
}

/** Resolve model from tier config and build final RouteDecision. */
function finalize(
  score: ScoreResult,
  config: ResolvedConfig,
  t0: number,
): RouteDecision {
  const tierConf = config.tiers[score.tier];
  return {
    tier: score.tier,
    model: tierConf.primary,
    fallback: tierConf.fallback,
    score,
    latencyMs: parseFloat((performance.now() - t0).toFixed(3)),
  };
}
