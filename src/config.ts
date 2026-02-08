/**
 * @aiwaretop/claw-router — Configuration
 *
 * Merges user-supplied config with sensible defaults.
 * All fields are optional; missing values fall back to defaults.
 */

import {
  Tier,
  Dimension,
  DEFAULT_WEIGHTS,
  DEFAULT_THRESHOLDS,
  type RouterConfig,
  type TierModelConfig,
} from './router/types';

// ── Default model mapping ───────────────────────────────────────────────────

const DEFAULT_TIERS: Record<Tier, TierModelConfig> = {
  [Tier.TRIVIAL]:  { primary: 'default' },
  [Tier.SIMPLE]:   { primary: 'default' },
  [Tier.MODERATE]: { primary: 'default' },
  [Tier.COMPLEX]:  { primary: 'default' },
  [Tier.EXPERT]:   { primary: 'default' },
};

// ── Resolved (fully populated) config ───────────────────────────────────────

export interface ResolvedConfig {
  tiers: Record<Tier, TierModelConfig>;
  thresholds: [number, number, number, number];
  weights: Record<Dimension, number>;
  logging: boolean;
}

/**
 * Merge user config over defaults.
 */
export function resolveConfig(raw?: RouterConfig): ResolvedConfig {
  const tiers = { ...DEFAULT_TIERS };
  if (raw?.tiers) {
    for (const [key, val] of Object.entries(raw.tiers)) {
      if (val) tiers[key as Tier] = { ...tiers[key as Tier], ...val };
    }
  }

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
    tiers,
    thresholds,
    weights,
    logging: raw?.logging ?? false,
  };
}
