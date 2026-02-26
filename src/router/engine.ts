/**
 * @aiwaretop/claw-router — Routing Engine
 *
 * Orchestrates: overrides → scorer → sigmoid calibration → tier mapping → model selection.
 * Optionally integrates LLM-based scoring for improved accuracy.
 */

import {
  Tier, TIER_ORDER, Dimension,
  DEFAULT_WEIGHTS, DEFAULT_THRESHOLDS,
  type ScoreResult, type RouteDecision, type RouterConfig, type LlmScoringConfig,
} from './types';
import type { ResolvedConfig } from '../config';
import { checkOverrides } from './overrides';
import { scoreDimensions } from './scorer';
import { LlmScorer } from './llm-scorer';

// ── LLM Scorer Instance ───────────────────────────────────────────────────

let llmScorer: LlmScorer | null = null;

/**
 * Initialize LLM scorer with config and LLM invocation callback
 */
export function initLlmScorer(
  config: LlmScoringConfig, 
  invokeLLM: (model: string, prompt: string) => Promise<string>
): void {
  if (config.enabled) {
    llmScorer = new LlmScorer(config, invokeLLM);
  } else {
    llmScorer = null;
  }
}

/**
 * Get current LLM scorer instance
 */
export function getLlmScorer(): LlmScorer | null {
  return llmScorer;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Route a message: determine tier and model.
 *
 * @param message  Raw user message
 * @param config   Resolved plugin config
 * @returns        RouteDecision (tier, model, score breakdown, latency)
 */
export async function route(message: string, config: ResolvedConfig): Promise<RouteDecision> {
  const t0 = performance.now();

  // 1. Hard-rule overrides (always run first)
  const override = checkOverrides(message);
  if (override) {
    const score = buildOverrideScore(override.tier, override.rule);
    return finalize(score, config, t0);
  }

  // 2. 8-dimension rule-based scoring (always run first)
  const dimensions = scoreDimensions(message, config.weights);
  const rawSum = dimensions.reduce((s, d) => s + d.weighted, 0);
  const calibrated = calibrate(rawSum);
  const ruleTier = scoreToTier(calibrated, config.thresholds);

  const ruleScore: ScoreResult = { dimensions, rawSum, calibrated, tier: ruleTier };

  // 3. Check if LLM scoring is enabled
  if (llmScorer && config.llmScoring?.enabled) {
    const llmConfig = config.llmScoring;
    
    if (llmConfig.highSpeedMode) {
      // High-speed mode: async LLM evaluation (fire-and-forget)
      // Return rule result immediately, but trigger async LLM evaluation
      triggerAsyncLlmEvaluation(message, llmConfig).catch(err => {
        console.error('[claw-router] Async LLM evaluation failed:', err);
      });
      return finalize(ruleScore, config, t0);
    } else {
      // Accurate mode: sync LLM evaluation
      // Wait for LLM result before returning
      const llmResult = await syncLlmEvaluation(message, llmConfig);
      if (llmResult) {
        // Merge LLM result with rule result
        const mergedScore = mergeScores(ruleScore, llmResult);
        return finalize(mergedScore, config, t0);
      }
    }
  }

  // 4. Return rule-based result
  return finalize(ruleScore, config, t0);
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

// ── LLM Evaluation Helpers ──────────────────────────────────────────────────

/**
 * Trigger async LLM evaluation (high-speed mode)
 */
async function triggerAsyncLlmEvaluation(message: string, config: LlmScoringConfig): Promise<void> {
  if (!llmScorer) return;
  
  try {
    await llmScorer.evaluate(message);
    // Result is cached, will be used for future comparisons
  } catch (error) {
    console.error('[claw-router] Async LLM evaluation error:', error);
  }
}

/**
 * Synchronous LLM evaluation (accurate mode)
 */
async function syncLlmEvaluation(message: string, config: LlmScoringConfig): Promise<ScoreResult | null> {
  if (!llmScorer) return null;
  
  try {
    const result = await llmScorer.evaluate(message);
    if (result) {
      return llmScorer.convertToScoreResult(result);
    }
  } catch (error) {
    console.error('[claw-router] Sync LLM evaluation error:', error);
  }
  
  return null;
}

/**
 * Merge rule-based score with LLM score
 */
function mergeScores(ruleScore: ScoreResult, llmScore: ScoreResult): ScoreResult {
  return {
    ...llmScore,
    dimensions: llmScore.dimensions,
    rawSum: llmScore.rawSum,
    calibrated: llmScore.calibrated,
    tier: llmScore.tier,
    overrideApplied: 'llm_merged',
  };
}

// ── Internals ───────────────────────────────────────────────────────────────

/**
 * Calibration function: stretches the raw weighted sum into a full 0–1 range.
 */
function calibrate(x: number): number {
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
