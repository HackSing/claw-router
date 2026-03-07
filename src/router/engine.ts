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
import type { ResolvedConfig } from '../config';
import { checkOverrides } from './overrides';
import { scoreDimensions } from './scorer';
import { classifyTask } from './task-classifier';
import { extractTraits, scoreModels, selectModel } from './model-matcher';
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
export async function route(message: string, config: ResolvedConfig): Promise<RouteDecision> {
  const t0 = performance.now();
  const scorer = config.llmScorerInstance ?? null;

  // 1. 硬规则覆盖（始终优先）
  const override = checkOverrides(message);
  if (override) {
    const score = buildOverrideScore(override.tier, override.rule);
    return finalize(score, config, message, t0, scorer);
  }

  // 2. 8 维度规则评分（本地，< 1ms）
  const dimensions = scoreDimensions(message, config.weights);
  const rawSum = dimensions.reduce((s, d) => s + d.weighted, 0);
  const calibrated = calibrate(rawSum);
  const ruleTier = scoreToTier(calibrated, config.thresholds);

  const ruleScore: ScoreResult = { dimensions, rawSum, calibrated, tier: ruleTier };

  // 3. 条件触发 LLM 评分（仅在边界区间且 LLM 已启用时）
  if (scorer && config.llmScoring?.enabled) {
    if (isNearBoundary(calibrated, config.thresholds)) {
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

  // 4. 返回规则评分结果
  return finalize(ruleScore, config, message, t0, scorer);
}

/**
 * 仅评分（不解析模型）。用于测试/调试。
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

/**
 * Sigmoid 校准：将原始加权和映射到 0–1 范围。
 * 参数经网格搜索优化（k=8, midpoint=0.18）。
 * S 曲线在中间区间提供更好的 tier 分辨力。
 */
function calibrate(x: number): number {
  return 1 / (1 + Math.exp(-8 * (x - 0.18)));
}

/** 将 calibrated 分数映射到 tier。 */
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

/** 为覆盖规则构建合成 ScoreResult。 */
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
): Promise<RouteDecision> {
  const taskType = classifyTask(message);

  // trait 匹配
  const traits = extractTraits(score.tier, taskType);
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
    tier: score.tier,
    taskType,
    model: modelId,
    score,
    latencyMs: parseFloat((performance.now() - t0).toFixed(3)),
    matchSource,
    candidates: candidates.slice(0, 3),  // 只保留 top 3 用于日志
  };
}
