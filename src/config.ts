/**
 * @aiwaretop/claw-router — Configuration
 *
 * 合并用户配置与默认值。
 * 所有字段可选，缺失时回退到默认值。
 */

import {
  Tier,
  Dimension,
  DEFAULT_WEIGHTS,
  DEFAULT_THRESHOLDS,
  type RouterConfig,
  type ModelProfile,
  type LlmScoringConfig,
} from './router/types';

// ── 默认模型（全能 fallback）─────────────────────────────────────────────

const DEFAULT_MODELS: ModelProfile[] = [
  {
    id: 'default',
    traits: [
      'TRIVIAL', 'SIMPLE', 'MODERATE', 'COMPLEX', 'EXPERT',
      'coding', 'writing', 'chat', 'analysis', 'translation', 'math', 'research', 'other',
    ],
  },
];

// ── 解析后的完整配置 ─────────────────────────────────────────────────────

export interface ResolvedConfig {
  models: ModelProfile[];
  thresholds: [number, number, number, number];
  weights: Record<Dimension, number>;
  logging: boolean;
  llmScoring?: LlmScoringConfig;
}

/**
 * 合并用户配置与默认值。
 */
export function resolveConfig(raw?: RouterConfig): ResolvedConfig {
  // models：用户配置 + 默认 fallback（确保始终有兜底模型）
  const userModels = raw?.models ?? [];
  const hasDefault = userModels.some(m => m.id === 'default');
  const models = hasDefault ? userModels : [...userModels, ...DEFAULT_MODELS];

  const thresholds: [number, number, number, number] =
    raw?.thresholds && raw.thresholds.length === 4
      ? raw.thresholds
      : [...DEFAULT_THRESHOLDS];

  const weights: Record<Dimension, number> = { ...DEFAULT_WEIGHTS };
  if (raw?.scoring?.weights) {
    for (const [key, val] of Object.entries(raw.scoring.weights)) {
      if (typeof val === 'number') weights[key as Dimension] = val;
    }
  }

  return {
    models,
    thresholds,
    weights,
    logging: raw?.logging ?? false,
    llmScoring: raw?.llmScoring,
  };
}
