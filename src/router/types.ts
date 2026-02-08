/**
 * @aiwaretop/claw-router — Type Definitions
 *
 * Core types for the 8-dimension scoring engine and tier routing system.
 */

// ── Tier ────────────────────────────────────────────────────────────────────

/** The five complexity tiers, ordered from simplest to hardest. */
export enum Tier {
  TRIVIAL  = 'TRIVIAL',
  SIMPLE   = 'SIMPLE',
  MODERATE = 'MODERATE',
  COMPLEX  = 'COMPLEX',
  EXPERT   = 'EXPERT',
}

/** Ordered array for threshold-based lookups. */
export const TIER_ORDER: Tier[] = [
  Tier.TRIVIAL,
  Tier.SIMPLE,
  Tier.MODERATE,
  Tier.COMPLEX,
  Tier.EXPERT,
];

// ── Scoring Dimensions ──────────────────────────────────────────────────────

/** The eight scoring dimensions. */
export enum Dimension {
  REASONING       = 'reasoning',
  CODE_TECH       = 'codeTech',
  TASK_STEPS      = 'taskSteps',
  DOMAIN_EXPERT   = 'domainExpert',
  OUTPUT_COMPLEX  = 'outputComplex',
  CREATIVITY      = 'creativity',
  CONTEXT_DEPEND  = 'contextDepend',
  MESSAGE_LENGTH  = 'messageLength',
}

/** Default weights for each dimension (sum = 1.0). */
export const DEFAULT_WEIGHTS: Record<Dimension, number> = {
  [Dimension.REASONING]:       0.20,
  [Dimension.CODE_TECH]:       0.18,
  [Dimension.TASK_STEPS]:      0.15,
  [Dimension.DOMAIN_EXPERT]:   0.12,
  [Dimension.OUTPUT_COMPLEX]:  0.10,
  [Dimension.CREATIVITY]:      0.10,
  [Dimension.CONTEXT_DEPEND]:  0.08,
  [Dimension.MESSAGE_LENGTH]:  0.07,
};

/** Default tier thresholds: [TRIVIAL→SIMPLE, SIMPLE→MODERATE, MODERATE→COMPLEX, COMPLEX→EXPERT] */
export const DEFAULT_THRESHOLDS: [number, number, number, number] = [0.15, 0.35, 0.55, 0.75];

// ── Score Results ───────────────────────────────────────────────────────────

/** Per-dimension score (0–1). */
export interface DimensionScore {
  dimension: Dimension;
  raw: number;       // raw score 0–1
  weight: number;    // effective weight
  weighted: number;  // raw × weight
}

/** Full scoring breakdown for a single message. */
export interface ScoreResult {
  dimensions: DimensionScore[];
  rawSum: number;          // Σ(weighted) before calibration
  calibrated: number;      // after sigmoid calibration, 0–1
  tier: Tier;
  overrideApplied?: string; // if a hard rule overrode the score
}

// ── Routing ─────────────────────────────────────────────────────────────────

/** Model assignment for one tier. */
export interface TierModelConfig {
  primary: string;
  fallback?: string;
}

/** The final routing decision returned to callers. */
export interface RouteDecision {
  tier: Tier;
  model: string;
  fallback?: string;
  score: ScoreResult;
  latencyMs: number;
}

// ── Configuration ───────────────────────────────────────────────────────────

/** User-supplied plugin configuration (all optional — deep-merged with defaults). */
export interface RouterConfig {
  tiers?: Partial<Record<Tier, TierModelConfig>>;
  thresholds?: [number, number, number, number];
  scoring?: {
    weights?: Partial<Record<Dimension, number>>;
  };
  logging?: boolean;
}

// ── Keyword Entry ───────────────────────────────────────────────────────────

/** A single keyword/pattern entry used in the scoring engine. */
export interface KeywordEntry {
  /** The keyword string or regex pattern. */
  pattern: string;
  /** Weight contribution when matched (0–1). */
  weight: number;
  /** If true, `pattern` is treated as a RegExp source string. */
  isRegex?: boolean;
}

/** Keywords organised by dimension. */
export type KeywordMap = Record<Dimension, KeywordEntry[]>;

// ── Stats ───────────────────────────────────────────────────────────────────

/** Runtime statistics for the router. */
export interface RouterStats {
  totalRouted: number;
  tierCounts: Record<Tier, number>;
  avgLatencyMs: number;
  overrideCount: number;
}
