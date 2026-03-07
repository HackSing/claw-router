/**
 * @aiwaretop/claw-router — Routing Engine
 *
 * 编排流程：overrides → 规则评分 → 边界检测 → 条件 LLM → 加权融合 → tier 映射
 *          → 任务分类 → trait 提取 → 模型匹配 → [LLM 仲裁] → 最终决策
 */

import {
  Tier, Dimension, TaskType,
  DEFAULT_WEIGHTS, DEFAULT_THRESHOLDS,
  type ScoreResult, type RouteDecision, type MatchSource,
} from './types';
import { calibrate, scoreToTier, TIER_CALIBRATED_SCORES } from './math-utils';
import type { ResolvedConfig } from '../config';
import { checkOverrides } from './overrides';
import { scoreDimensions } from './scorer';
import { classifyTask } from './task-classifier';
import { computeSemanticScores } from './semantic';
import { extractTraits, scoreModels, selectModel } from './model-matcher';
import { extractSemanticSignals } from './semantic-signals';
import { applyContextModifier } from './context';
import type { LlmScorer } from './llm-scorer';

// ── 边界检测 ────────────────────────────────────────────────────────────────

/** 默认边界检测半径 */
const BOUNDARY_DELTA = 0.08;

/**
 * 判断 calibrated 分数是否处于任一 tier 阈值的边界区间内。
 * 处于边界区间意味着规则评分不够确定，需要 LLM 辅助判断。
 */
export function isNearBoundary(
  score: number,
  thresholds: [number, number, number, number] = DEFAULT_THRESHOLDS,
  delta: number = BOUNDARY_DELTA,
): boolean {
  return thresholds.some(t => Math.abs(score - t) <= delta);
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * 路由消息：确定 tier、taskType 和最优模型。
 *
 * @param message  用户原始消息
 * @param config   解析后的插件配置
 * @returns        RouteDecision（tier、taskType、model、匹配细节、延迟）
 */
export async function route(
  message: string,
  config: ResolvedConfig,
  history: string[] = []
): Promise<RouteDecision> {
  const t0 = performance.now();
  const scorer = config.llmScorerInstance ?? null;

  // 1. 硬规则覆盖（始终优先，但也接受上下文补偿以避免短句误判）
  const override = checkOverrides(message);
  if (override) {
    let score = buildOverrideScore(override.tier, override.rule);
    score = applyContextModifier(message, history, score, config.weights, config.thresholds);
    return finalize(score, config, message, t0, scorer);
  }

  // 2. Semantic Routing (语义路由主干道)
  let semanticScore: ScoreResult | null = null;
  let semanticTaskType: TaskType | null = null;

  if (config.enableSemanticRouting) {
    try {
      const semanticResults = await computeSemanticScores(message);
      // 选取最高相似度且必须超过阈值 0.45 否则视为无意义
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

  // 3. 启发式规则评分（语义未命中时的兜底）
  const dimensions = scoreDimensions(message, config.weights);
  let ruleScore: ScoreResult;
  if (semanticScore) {
    ruleScore = semanticScore;
    ruleScore.dimensions = dimensions;
  } else {
    const rawSum = dimensions.reduce((s, d) => s + d.weighted, 0);
    let calibrated = calibrate(rawSum);
    let ruleTier = scoreToTier(calibrated, config.thresholds);
    ruleScore = { dimensions, rawSum, calibrated, tier: ruleTier };
  }

  // 4. 上下文感知修饰
  ruleScore = applyContextModifier(message, history, ruleScore, config.weights, config.thresholds);

  // 5. 条件触发 LLM 评分（仅在边界区间且 LLM 已启用时）
  if (scorer && config.llmScoring?.enabled) {
    if (isNearBoundary(ruleScore.calibrated, config.thresholds)) {
      try {
        const llmResult = await scorer.evaluate(message);
        if (llmResult) {
          const llmScore = scorer.convertToScoreResult(llmResult);
          const merged = mergeScores(ruleScore, llmScore, llmResult.confidence);
          return finalize(merged, config, message, t0, scorer);
        }
      } catch (error) {
        console.error('[claw-router] LLM 评估错误，回退到规则结果:', error);
      }
    }
  }

  // 6. 返回规则评分结果
  return finalize(ruleScore, config, message, t0, scorer, semanticTaskType || undefined);
}

/**
 * 仅评分（不解析模型）。用于测试/调试。
 *
 * 注意：此函数为同步 API，不包含 Semantic Routing 逻辑。
 * 若需与 route() 完全一致的评分，请直接调用 route()。
 */
export function scoreOnly(
  message: string,
  config: ResolvedConfig,
  history: string[] = []
): ScoreResult {
  const override = checkOverrides(message);
  if (override) {
    const score = buildOverrideScore(override.tier, override.rule);
    return applyContextModifier(message, history, score, config.weights, config.thresholds);
  }

  const dimensions = scoreDimensions(message, config.weights);
  const rawSum = dimensions.reduce((s, d) => s + d.weighted, 0);
  let calibrated = calibrate(rawSum);
  let tier = scoreToTier(calibrated, config.thresholds);

  let baseScore = { dimensions, rawSum, calibrated, tier };
  return applyContextModifier(message, history, baseScore, config.weights, config.thresholds);
}

// ── 分数融合 ────────────────────────────────────────────────────────────────

/**
 * 加权融合规则评分与 LLM 评分。
 * LLM confidence 越高，LLM 结果权重越大（最高占 70%）。
 */
function mergeScores(
  ruleScore: ScoreResult,
  llmScore: ScoreResult,
  llmConfidence: number,
): ScoreResult {
  const llmWeight = Math.min(llmConfidence, 1) * 0.7;
  const ruleWeight = 1 - llmWeight;

  const calibrated = ruleWeight * ruleScore.calibrated + llmWeight * llmScore.calibrated;
  const tier = scoreToTier(calibrated);

  return {
    dimensions: ruleScore.dimensions,
    rawSum: ruleScore.rawSum,
    calibrated,
    tier,
    overrideApplied: `llm_merged(c=${llmConfidence.toFixed(2)},w=${llmWeight.toFixed(2)})`,
  };
}

// ── 内部工具 ────────────────────────────────────────────────────────────────

// 注意：calibrate / scoreToTier 已提取到 math-utils.ts，此处通过顶部 import 引用。

/** 零分维度数组（模块级常量，避免每次创建）。 */
const ZERO_DIMENSIONS = Object.values(Dimension).map(dim => ({
  dimension: dim,
  raw: 0,
  weight: DEFAULT_WEIGHTS[dim],
  weighted: 0,
}));

/** 为覆盖规则构建合成 ScoreResult。 */
function buildOverrideScore(tier: Tier, rule: string): ScoreResult {
  const cal = TIER_CALIBRATED_SCORES[tier];
  return {
    dimensions: ZERO_DIMENSIONS.map(d => ({ ...d })),
    rawSum: cal,
    calibrated: cal,
    tier,
    overrideApplied: rule,
  };
}

/**
 * 从 trait 匹配中选择最优模型并构建最终 RouteDecision。
 *
 * 流程：
 * 1. 分类任务类型
 * 2. 提取 traits（tier + taskType）
 * 3. 对所有模型评分
 * 4. 选择最优模型（并列时触发 LLM 仲裁）
 */
async function finalize(
  score: ScoreResult,
  config: ResolvedConfig,
  message: string,
  t0: number,
  scorer: LlmScorer | null = null,
  semanticTaskType?: TaskType
): Promise<RouteDecision> {
  const taskType = semanticTaskType || classifyTask(message);
  const adjustedScore = applyTechnicalReviewFloor(score, taskType, message, config.thresholds);

  // trait 匹配
  const traits = extractTraits(adjustedScore.tier, taskType);
  const candidates = scoreModels(traits, config.models);
  const selection = selectModel(candidates);

  let modelId = selection.modelId;
  let matchSource: MatchSource = 'trait';

  // 如果多候选并列且 LLM 可用，触发仲裁
  if (selection.needsArbitration && scorer && config.llmScoring?.enabled) {
    try {
      const arbitrationResult = await scorer.arbitrate(message, selection.tiedCandidates);
      if (arbitrationResult) {
        modelId = arbitrationResult.model;
        matchSource = 'llm_arbitration';
      }
    } catch (error) {
      console.error('[claw-router] LLM 仲裁错误，使用默认选择:', error);
    }
  }

  // 如果最终模型是 default 且有其他非 default 候选，标记来源
  if (modelId === 'default' && candidates.some(c => c.model.id !== 'default' && c.score > 0)) {
    matchSource = 'default';
  }

  return {
    tier: adjustedScore.tier,
    taskType,
    model: modelId,
    score: adjustedScore,
    latencyMs: parseFloat((performance.now() - t0).toFixed(3)),
    matchSource,
    candidates: candidates.slice(0, 3),  // 只保留 top 3 用于日志
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
  return {
    ...score,
    calibrated: Math.max(score.calibrated, floorScore),
    tier: scoreToTier(Math.max(score.calibrated, floorScore), thresholds),
    overrideApplied: score.overrideApplied
      ? `${score.overrideApplied}+technical_review_floor`
      : 'technical_review_floor',
  };
}
