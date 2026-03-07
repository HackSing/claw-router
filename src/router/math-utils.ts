/**
 * @aiwaretop/claw-router — 数学工具
 *
 * 提取自 engine.ts / scorer.ts / semantic-signals.ts 的共享纯函数。
 * 消除循环依赖：context.ts 不再需要 import engine.ts。
 */

import { Tier, DEFAULT_THRESHOLDS } from './types';

// ── Tier → 校准分数映射（全局唯一数据源）──────────────────────────────────

/** 各 Tier 对应的标准校准分数（用于 override、LLM 融合等场景）。 */
export const TIER_CALIBRATED_SCORES: Record<Tier, number> = {
    [Tier.TRIVIAL]: 0.08,
    [Tier.SIMPLE]: 0.28,
    [Tier.MODERATE]: 0.48,
    [Tier.COMPLEX]: 0.68,
    [Tier.EXPERT]: 0.90,
};

// ── 校准函数 ────────────────────────────────────────────────────────────────

/**
 * Sigmoid 校准：将原始加权和映射到 0–1 范围。
 * 参数经网格搜索优化（k=8, midpoint=0.18）。
 * S 曲线在中间区间提供更好的 tier 分辨力。
 */
export function calibrate(x: number): number {
    return 1 / (1 + Math.exp(-8 * (x - 0.18)));
}

/**
 * calibrate() 的反函数：将 0–1 的 calibrated 分数映射回校准前 rawSum。
 * 用于 override / LLM 结果与上下文补偿保持同一数值空间。
 */
export function inverseCalibrate(score: number): number {
    const clamped = clamp(score, 1e-6, 1 - 1e-6);
    return 0.18 + Math.log(clamped / (1 - clamped)) / 8;
}

/** 将 calibrated 分数映射到 tier。 */
export function scoreToTier(
    score: number,
    thresholds: [number, number, number, number] = DEFAULT_THRESHOLDS,
): Tier {
    if (score < thresholds[0]) return Tier.TRIVIAL;
    if (score < thresholds[1]) return Tier.SIMPLE;
    if (score < thresholds[2]) return Tier.MODERATE;
    if (score < thresholds[3]) return Tier.COMPLEX;
    return Tier.EXPERT;
}

// ── 通用工具 ────────────────────────────────────────────────────────────────

/** 将数值钳制到 [min, max] 范围。 */
export function clamp(v: number, min = 0, max = 1): number {
    return Math.max(min, Math.min(max, v));
}

/** 线性插值。 */
export function lerp(x0: number, x1: number, y0: number, y1: number, x: number): number {
    return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
}
