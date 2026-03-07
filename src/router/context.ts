/**
 * @aiwaretop/claw-router — Context Awareness
 *
 * 历史消息上下文分析器：
 * - 提取历史消息的复杂度特征
 * - 对于短促指令提供上下文分数补偿
 */

import { Dimension, Tier, type ScoreResult } from './types';
import { scoreDimensions } from './scorer';
import { checkOverrides } from './overrides';
import { calibrate, scoreToTier } from './math-utils';

/**
 * 评估历史上下文，并据此对当前消息的 ScoreResult 进行修正
 * 
 * @param currentMessage 当前用户的消息
 * @param history 历史消息列表（按时间倒序，即 history[0] 是上一条）
 * @param currentScore 引擎对当前消息给出的初步评分
 * @param weights 各维度的权重配置
 * @param thresholds Tier 阈值数组
 * @returns 经过历史上下文修饰（补偿）后的新评分，如果不需要修饰则直接返回原评分
 */
export function applyContextModifier(
    currentMessage: string,
    history: string[],
    currentScore: ScoreResult,
    weights: Record<Dimension, number>,
    thresholds: [number, number, number, number]
): ScoreResult {
    // 如果没有历史消息，或当前消息本身已经很长/复杂度很高，则无需补偿
    if (!history || history.length === 0) return currentScore;
    if (currentMessage.length > 50 || currentScore.rawSum > 0.6) return currentScore;

    // 取最近两轮历史，首条最近历史不衰减，越久远权重越低
    const recentHistory = history.slice(0, 2);
    let accumulatedRawSum = 0;
    let decay = 1.0;

    for (const msg of recentHistory) {
        const histDims = scoreDimensions(msg, weights);
        const histOverride = checkOverrides(msg);

        let histRawSum = histDims.reduce((acc, d) => acc + d.weighted, 0);
        // 历史消息触发高阶硬规则时，注入巨大惯性分数
        if (histOverride && (histOverride.tier === Tier.COMPLEX || histOverride.tier === Tier.EXPERT)) {
            histRawSum = Math.max(histRawSum, 0.8);
        }

        accumulatedRawSum += histRawSum * decay;
        decay *= 0.5;
    }

    // 上下文环境补偿因子
    const contextBoost = accumulatedRawSum * weights[Dimension.CONTEXT_DEPEND];

    // 若补偿明显，则修改当次评分
    if (contextBoost > 0.02) {
        const newRawSum = currentScore.rawSum + contextBoost;
        const newCalibrated = calibrate(newRawSum);

        const newDims = [...currentScore.dimensions];
        const ctxDimIdx = newDims.findIndex(d => d.dimension === Dimension.CONTEXT_DEPEND);
        if (ctxDimIdx !== -1) {
            newDims[ctxDimIdx] = {
                dimension: Dimension.CONTEXT_DEPEND,
                raw: Math.min(1, accumulatedRawSum),
                weight: weights[Dimension.CONTEXT_DEPEND],
                weighted: contextBoost
            };
        }

        return {
            ...currentScore,
            rawSum: newRawSum,
            calibrated: newCalibrated,
            tier: scoreToTier(newCalibrated, thresholds),
            dimensions: newDims,
        };
    }

    return currentScore;
}
