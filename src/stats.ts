/**
 * @aiwaretop/claw-router — Router Stats
 *
 * 路由决策的运行时统计跟踪。
 */

import { Tier, type RouterStats, type RouteDecision } from './router/types';

/** 创建空统计对象 */
export function createStats(): RouterStats {
    return {
        totalRouted: 0,
        tierCounts: {
            [Tier.TRIVIAL]: 0,
            [Tier.SIMPLE]: 0,
            [Tier.MODERATE]: 0,
            [Tier.COMPLEX]: 0,
            [Tier.EXPERT]: 0,
        },
        avgLatencyMs: 0,
        overrideCount: 0,
    };
}

/** 记录一次路由决策到统计 */
export function trackDecision(stats: RouterStats, d: RouteDecision): void {
    stats.totalRouted++;
    stats.tierCounts[d.tier]++;
    if (d.score.overrideApplied) stats.overrideCount++;
    stats.avgLatencyMs =
        stats.avgLatencyMs + (d.latencyMs - stats.avgLatencyMs) / stats.totalRouted;
}
