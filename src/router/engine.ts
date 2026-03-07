/**
 * @aiwaretop/claw-router - Routing Engine
 */

import {
  Tier,
  Dimension,
  TaskType,
  DEFAULT_WEIGHTS,
  DEFAULT_THRESHOLDS,
  type ScoreResult,
  type RouteDecision,
  type MatchSource,
} from './types';
import type { ResolvedConfig } from '../config';
import { calibrate, inverseCalibrate, scoreToTier, TIER_CALIBRATED_SCORES } from './math-utils';
import { checkOverrides } from './overrides';
import { scoreDimensions } from './scorer';
import { classifyTask } from './task-classifier';
import { computeSemanticScores } from './semantic';
import { extractTraits, scoreModels, selectModel } from './model-matcher';
import { extractSemanticSignals } from './semantic-signals';
import { applyContextModifier } from './context';
import type { LlmScorer } from './llm-scorer';

const BOUNDARY_DELTA = 0.08;

export function isNearBoundary(
  score: number,
  thresholds: [number, number, number, number] = DEFAULT_THRESHOLDS,
  delta: number = BOUNDARY_DELTA,
): boolean {
  return thresholds.some(threshold => Math.abs(score - threshold) <= delta);
}

export async function route(
  message: string,
  config: ResolvedConfig,
  history: string[] = [],
): Promise<RouteDecision> {
  const t0 = performance.now();
  const scorer = config.llmScorerInstance ?? null;

  const override = checkOverrides(message);
  if (override) {
    let score = buildOverrideScore(override.tier, override.rule);
    score = applyContextModifier(message, history, score, config.weights, config.thresholds);
    return finalize(score, config, message, t0, scorer);
  }

  let semanticScore: ScoreResult | null = null;
  let semanticTaskType: TaskType | null = null;

  if (config.enableSemanticRouting) {
    try {
      const semanticResults = await computeSemanticScores(message);
      if (semanticResults && semanticResults.length > 0 && semanticResults[0].similarity > 0.45) {
        const topMatch = semanticResults[0];
        if (topMatch.tier) {
          semanticScore = buildOverrideScore(topMatch.tier, `semantic_match (${topMatch.similarity.toFixed(2)})`);
        }
        if (topMatch.taskType) {
          semanticTaskType = topMatch.taskType;
        }
      }
    } catch (err) {
      console.error('[claw-router] Semantic routing failed, falling back to heuristics:', err);
    }
  }

  const dimensions = scoreDimensions(message, config.weights);
  let ruleScore: ScoreResult;
  if (semanticScore) {
    ruleScore = {
      ...semanticScore,
      dimensions,
    };
  } else {
    const rawSum = dimensions.reduce((sum, dimension) => sum + dimension.weighted, 0);
    const calibrated = calibrate(rawSum);
    const tier = scoreToTier(calibrated, config.thresholds);
    ruleScore = { dimensions, rawSum, calibrated, tier };
  }

  ruleScore = applyContextModifier(message, history, ruleScore, config.weights, config.thresholds);

  if (scorer && config.llmScoring?.enabled && isNearBoundary(ruleScore.calibrated, config.thresholds)) {
    try {
      const llmResult = await scorer.evaluate(message);
      if (llmResult) {
        const llmScore = scorer.convertToScoreResult(llmResult);
        const merged = mergeScores(ruleScore, llmScore, llmResult.confidence, config.thresholds);
        return finalize(merged, config, message, t0, scorer, semanticTaskType || undefined);
      }
    } catch (error) {
      console.error('[claw-router] LLM evaluation failed, falling back to rule score:', error);
    }
  }

  return finalize(ruleScore, config, message, t0, scorer, semanticTaskType || undefined);
}

export function scoreOnly(
  message: string,
  config: ResolvedConfig,
  history: string[] = [],
): ScoreResult {
  const override = checkOverrides(message);
  if (override) {
    const score = buildOverrideScore(override.tier, override.rule);
    return applyContextModifier(message, history, score, config.weights, config.thresholds);
  }

  const dimensions = scoreDimensions(message, config.weights);
  const rawSum = dimensions.reduce((sum, dimension) => sum + dimension.weighted, 0);
  const calibrated = calibrate(rawSum);
  const tier = scoreToTier(calibrated, config.thresholds);

  return applyContextModifier(
    message,
    history,
    { dimensions, rawSum, calibrated, tier },
    config.weights,
    config.thresholds,
  );
}

function mergeScores(
  ruleScore: ScoreResult,
  llmScore: ScoreResult,
  llmConfidence: number,
  thresholds: [number, number, number, number] = DEFAULT_THRESHOLDS,
): ScoreResult {
  const llmWeight = Math.min(llmConfidence, 1) * 0.7;
  const ruleWeight = 1 - llmWeight;
  const calibrated = ruleWeight * ruleScore.calibrated + llmWeight * llmScore.calibrated;

  return {
    dimensions: ruleScore.dimensions,
    rawSum: ruleScore.rawSum,
    calibrated,
    tier: scoreToTier(calibrated, thresholds),
    overrideApplied: `llm_merged(c=${llmConfidence.toFixed(2)},w=${llmWeight.toFixed(2)})`,
  };
}

const ZERO_DIMENSIONS = Object.values(Dimension).map(dimension => ({
  dimension,
  raw: 0,
  weight: DEFAULT_WEIGHTS[dimension],
  weighted: 0,
}));

function buildOverrideScore(tier: Tier, rule: string): ScoreResult {
  const calibrated = TIER_CALIBRATED_SCORES[tier];
  return {
    dimensions: ZERO_DIMENSIONS.map(dimension => ({ ...dimension })),
    rawSum: inverseCalibrate(calibrated),
    calibrated,
    tier,
    overrideApplied: rule,
  };
}

async function finalize(
  score: ScoreResult,
  config: ResolvedConfig,
  message: string,
  t0: number,
  scorer: LlmScorer | null = null,
  semanticTaskType?: TaskType,
): Promise<RouteDecision> {
  const taskType = semanticTaskType || classifyTask(message);
  const adjustedScore = applyTechnicalReviewFloor(score, taskType, message, config.thresholds);
  const traits = extractTraits(adjustedScore.tier, taskType);
  const candidates = scoreModels(traits, config.models);
  const selection = selectModel(candidates);

  let modelId = selection.modelId;
  let matchSource: MatchSource = 'trait';

  if (selection.needsArbitration && scorer && config.llmScoring?.enabled) {
    try {
      const arbitrationResult = await scorer.arbitrate(message, selection.tiedCandidates);
      if (arbitrationResult) {
        modelId = arbitrationResult.model;
        matchSource = 'llm_arbitration';
      }
    } catch (error) {
      console.error('[claw-router] LLM arbitration failed, using default selection:', error);
    }
  }

  if (modelId === 'default' && candidates.some(candidate => candidate.model.id !== 'default' && candidate.score > 0)) {
    matchSource = 'default';
  }

  return {
    tier: adjustedScore.tier,
    taskType,
    model: modelId,
    score: adjustedScore,
    latencyMs: parseFloat((performance.now() - t0).toFixed(3)),
    matchSource,
    candidates: candidates.slice(0, 3),
  };
}

function applyTechnicalReviewFloor(
  score: ScoreResult,
  taskType: TaskType,
  message: string,
  thresholds: [number, number, number, number] = DEFAULT_THRESHOLDS,
): ScoreResult {
  const signals = extractSemanticSignals(message);
  const isTechnicalReview = signals.reviewIntent >= 0.45 && signals.techContext >= 0.35;
  const currentTier = scoreToTier(score.calibrated, thresholds);

  if (!isTechnicalReview) return score;
  if (taskType !== TaskType.CODING && taskType !== TaskType.ANALYSIS && taskType !== TaskType.OTHER) return score;
  if (currentTier === Tier.MODERATE || currentTier === Tier.COMPLEX || currentTier === Tier.EXPERT) return score;

  const floorScore = thresholds[1] + 0.01;
  const calibrated = Math.max(score.calibrated, floorScore);
  return {
    ...score,
    calibrated,
    tier: scoreToTier(calibrated, thresholds),
    overrideApplied: score.overrideApplied
      ? `${score.overrideApplied}+technical_review_floor`
      : 'technical_review_floor',
  };
}
