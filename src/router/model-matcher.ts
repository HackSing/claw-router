/**
 * @aiwaretop/claw-router — Model Matcher
 *
 * Trait 匹配引擎：从消息特征中提取 traits，与模型声明的 traits 做匹配。
 *
 * 流程：extractTraits() → scoreModels() → selectModel()
 */

import { Tier, TaskType, type ModelProfile, type TraitMatchResult } from './types';

// ── 特征提取 ────────────────────────────────────────────────────────────────

/**
 * 从消息的评分结果中提取 trait 集合。
 * 合并 Tier（复杂度）和 TaskType（场景）为统一的 trait 列表。
 */
export function extractTraits(tier: Tier, taskType: TaskType): string[] {
    const traits: string[] = [tier];  // Tier 值本身就是合法 trait（如 "COMPLEX"）
    if (taskType !== TaskType.OTHER) {
        traits.push(taskType);          // TaskType 值也是合法 trait（如 "coding"）
    }
    return traits;
}

// ── 模型评分 ────────────────────────────────────────────────────────────────

/**
 * 对所有模型计算 trait 匹配得分。
 *
 * 评分策略：
 * - matchedTraits = model.traits ∩ messageTraits
 * - score = matchedTraits.length / messageTraits.length
 * - 按 score 降序排列
 *
 * @returns 按分数降序排列的候选列表
 */
export function scoreModels(messageTraits: string[], models: ModelProfile[]): TraitMatchResult[] {
    if (messageTraits.length === 0 || models.length === 0) {
        return [];
    }

    // 归一化比较：trait 匹配不区分大小写
    const normalizedTraits = messageTraits.map(t => t.toLowerCase());

    const results: TraitMatchResult[] = models.map(model => {
        const normalizedModelTraits = model.traits.map(t => t.toLowerCase());
        const matchedTraits = normalizedTraits.filter(t => normalizedModelTraits.includes(t));

        return {
            model,
            score: matchedTraits.length / normalizedTraits.length,
            matchedTraits,
        };
    });

    // 按分数降序，同分时按 traits 数量少的优先（更专精的模型优先）
    results.sort((a, b) => {
        if (Math.abs(a.score - b.score) > 0.001) return b.score - a.score;
        return a.model.traits.length - b.model.traits.length;
    });

    return results;
}

// ── 模型选择 ────────────────────────────────────────────────────────────────

/** 并列阈值：两个候选分数差在此范围内视为并列 */
const TIE_THRESHOLD = 0.01;

export interface SelectionResult {
    /** 选中的模型 ID */
    modelId: string;
    /** 是否需要 LLM 仲裁（多个候选分数并列） */
    needsArbitration: boolean;
    /** 需要仲裁时的并列候选列表 */
    tiedCandidates: TraitMatchResult[];
}

/**
 * 从评分后的候选列表中选择模型。
 *
 * - 最高分唯一 → 直接返回
 * - 最高分并列（差 ≤ TIE_THRESHOLD）→ 标记需要 LLM 仲裁
 * - 无候选 → 回退到 "default"
 */
export function selectModel(candidates: TraitMatchResult[]): SelectionResult {
    if (candidates.length === 0) {
        return { modelId: 'default', needsArbitration: false, tiedCandidates: [] };
    }

    const best = candidates[0];

    // 过滤 score=0 的候选
    if (best.score === 0) {
        return { modelId: 'default', needsArbitration: false, tiedCandidates: [] };
    }

    // 找出所有与最高分并列的候选（排除 default 模型，它是兜底不参与竞争）
    const tied = candidates.filter(
        c => Math.abs(c.score - best.score) <= TIE_THRESHOLD && c.model.id !== 'default'
    );

    if (tied.length === 0) {
        // 非 default 模型全部 score=0，只有 default 命中
        return { modelId: best.model.id, needsArbitration: false, tiedCandidates: [] };
    }

    if (tied.length === 1) {
        return { modelId: tied[0].model.id, needsArbitration: false, tiedCandidates: [] };
    }

    // 多个非 default 模型并列 → 需要仲裁
    return {
        modelId: tied[0].model.id,     // 暂选第一个（按专精度排序的）
        needsArbitration: true,
        tiedCandidates: tied,
    };
}
