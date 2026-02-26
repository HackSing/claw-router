/**
 * @aiwaretop/claw-router — Routing Engine
 *
 * 编排流程：overrides → 规则评分 → 边界检测 → 条件 LLM → 加权融合 → tier 映射 → 模型选择
 */

import {
  Tier, Dimension,
  DEFAULT_WEIGHTS, DEFAULT_THRESHOLDS,
  type ScoreResult, type RouteDecision,
} from './types';
import type { ResolvedConfig } from '../config';
import { checkOverrides } from './overrides';
import { scoreDimensions } from './scorer';
import { LlmScorer } from './llm-scorer';

// ── LLM Scorer Instance ───────────────────────────────────────────────────

let llmScorer: LlmScorer | null = null;

/**
 * 初始化 LLM 评分器
 */
export function initLlmScorer(
  config: { enabled: boolean;[key: string]: any },
  invokeLLM: (model: string, prompt: string) => Promise<string>
): void {
  if (config.enabled) {
    llmScorer = new LlmScorer(config, invokeLLM);
  } else {
    llmScorer = null;
  }
}

/**
 * 获取当前 LLM 评分器实例
 */
export function getLlmScorer(): LlmScorer | null {
  return llmScorer;
}

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
 * 路由消息：确定 tier 和模型。
 *
 * @param message  用户原始消息
 * @param config   解析后的插件配置
 * @returns        RouteDecision（tier、model、评分细节、延迟）
 */
export async function route(message: string, config: ResolvedConfig): Promise<RouteDecision> {
  const t0 = performance.now();

  // 1. 硬规则覆盖（始终优先）
  const override = checkOverrides(message);
  if (override) {
    const score = buildOverrideScore(override.tier, override.rule);
    return finalize(score, config, t0);
  }

  // 2. 8 维度规则评分（本地，< 1ms）
  const dimensions = scoreDimensions(message, config.weights);
  const rawSum = dimensions.reduce((s, d) => s + d.weighted, 0);
  const calibrated = calibrate(rawSum);
  const ruleTier = scoreToTier(calibrated, config.thresholds);

  const ruleScore: ScoreResult = { dimensions, rawSum, calibrated, tier: ruleTier };

  // 3. 条件触发 LLM 评分（仅在边界区间且 LLM 已启用时）
  if (llmScorer && config.llmScoring?.enabled) {
    if (isNearBoundary(calibrated, config.thresholds)) {
      try {
        const llmResult = await llmScorer.evaluate(message);
        if (llmResult) {
          const llmScore = llmScorer.convertToScoreResult(llmResult);
          const merged = mergeScores(ruleScore, llmScore, llmResult.confidence);
          return finalize(merged, config, t0);
        }
      } catch (error) {
        console.error('[claw-router] LLM 评估错误，回退到规则结果:', error);
      }
    }
  }

  // 4. 返回规则评分结果
  return finalize(ruleScore, config, t0);
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
 * 校准函数：将原始加权和拉伸到 0–1 范围。
 */
function calibrate(x: number): number {
  const stretched = Math.min(x / 0.50, 1.0);
  return Math.pow(stretched, 0.75);
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

/** 从 tier 配置解析模型并构建最终 RouteDecision。 */
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
