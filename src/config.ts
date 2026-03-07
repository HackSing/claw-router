/**
 * @aiwaretop/claw-router — Configuration
 *
 * 合并用户配置与默认值。
 * 所有字段可选，缺失时回退到默认值。
 * 对非法配置输出警告并自动修正。
 */

import {
  Tier,
  Dimension,
  TaskType,
  DEFAULT_WEIGHTS,
  DEFAULT_THRESHOLDS,
  type RouterConfig,
  type ModelProfile,
  type ResolvedConfig,
} from './router/types';

// ResolvedConfig 已迁移至 types.ts，此处重新导出以保持向后兼容。
export type { ResolvedConfig } from './router/types';

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

// ── 合法 trait 词表 ─────────────────────────────────────────────────────

const VALID_TRAITS = new Set([
  ...Object.values(Tier).map(t => t.toLowerCase()),
  ...Object.values(TaskType).map(t => t.toLowerCase()),
]);

/**
 * 合并用户配置与默认值。
 * 包含校验：thresholds 递增、weights 归一化、traits 合法性。
 */
export function resolveConfig(raw?: RouterConfig): ResolvedConfig {
  // models：用户配置 + 默认 fallback（确保始终有兜底模型）
  const userModels = raw?.models ?? [];
  const hasDefault = userModels.some(m => m.id === 'default');
  const models = hasDefault ? userModels : [...userModels, ...DEFAULT_MODELS];

  // 校验 traits 合法性
  for (const model of models) {
    const invalidTraits = model.traits.filter(t => !VALID_TRAITS.has(t.toLowerCase()));
    if (invalidTraits.length > 0) {
      console.warn(
        `[claw-router] 模型 "${model.id}" 含无效 traits: [${invalidTraits.join(', ')}]。` +
        `合法值: ${[...VALID_TRAITS].join(', ')}`
      );
    }
  }

  // thresholds 校验：必须 4 个元素且严格递增
  let thresholds: [number, number, number, number];
  if (raw?.thresholds && raw.thresholds.length === 4) {
    const t = raw.thresholds;
    const isAscending = t[0] < t[1] && t[1] < t[2] && t[2] < t[3];
    if (!isAscending) {
      console.warn(
        `[claw-router] thresholds [${t.join(', ')}] 必须严格递增，回退到默认值。`
      );
      thresholds = [...DEFAULT_THRESHOLDS];
    } else {
      thresholds = [...t] as [number, number, number, number];
    }
  } else {
    thresholds = [...DEFAULT_THRESHOLDS];
  }

  // weights 合并 + 归一化校验
  const weights: Record<Dimension, number> = { ...DEFAULT_WEIGHTS };
  if (raw?.scoring?.weights) {
    for (const [key, val] of Object.entries(raw.scoring.weights)) {
      if (typeof val === 'number') weights[key as Dimension] = val;
    }
  }
  const weightSum = Object.values(weights).reduce((s, w) => s + w, 0);
  if (Math.abs(weightSum - 1.0) > 0.01) {
    console.warn(
      `[claw-router] 维度权重合计 ${weightSum.toFixed(4)} ≠ 1.0，建议调整。`
    );
  }

  return {
    models,
    thresholds,
    weights,
    logging: raw?.logging ?? false,
    enableSemanticRouting: raw?.enableSemanticRouting === true,
    llmScoring: raw?.llmScoring,
  };
}
