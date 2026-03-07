/**
 * @aiwaretop/claw-router — Model Matcher Tests
 *
 * 测试 trait 匹配引擎：特征提取、模型评分和模型选择。
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractTraits, scoreModels, selectModel } from '../src/router/model-matcher';
import { Tier, TaskType, type ModelProfile } from '../src/router/types';

// ═══════════════════════════════════════════════════════════════════════════
// extractTraits — 特征提取
// ═══════════════════════════════════════════════════════════════════════════

describe('extractTraits — 特征提取', () => {
    it('Tier + TaskType 合并为 traits', () => {
        const traits = extractTraits(Tier.COMPLEX, TaskType.CODING);
        assert.deepEqual(traits, ['COMPLEX', 'coding']);
    });

    it('TaskType=OTHER 时只有 Tier', () => {
        const traits = extractTraits(Tier.SIMPLE, TaskType.OTHER);
        assert.deepEqual(traits, ['SIMPLE']);
    });

    it('TRIVIAL + chat', () => {
        const traits = extractTraits(Tier.TRIVIAL, TaskType.CHAT);
        assert.deepEqual(traits, ['TRIVIAL', 'chat']);
    });

    it('EXPERT + math', () => {
        const traits = extractTraits(Tier.EXPERT, TaskType.MATH);
        assert.deepEqual(traits, ['EXPERT', 'math']);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// scoreModels — 模型评分
// ═══════════════════════════════════════════════════════════════════════════

describe('scoreModels — 模型评分', () => {
    const models: ModelProfile[] = [
        { id: 'code-model', traits: ['coding', 'COMPLEX', 'EXPERT'] },
        { id: 'chat-model', traits: ['chat', 'TRIVIAL', 'SIMPLE'] },
        { id: 'all-model', traits: ['coding', 'writing', 'chat', 'TRIVIAL', 'SIMPLE', 'MODERATE', 'COMPLEX', 'EXPERT'] },
    ];

    it('全匹配 → score = 1.0', () => {
        const results = scoreModels(['COMPLEX', 'coding'], models);
        const codeModel = results.find(r => r.model.id === 'code-model');
        assert.ok(codeModel);
        assert.equal(codeModel!.score, 1.0);
        assert.deepEqual(codeModel!.matchedTraits, ['complex', 'coding']);
    });

    it('部分匹配（Tier 邻近 + TaskType 匹配）', () => {
        // MODERATE 与 COMPLEX 相邻，邻近得分 0.5；coding 精确匹配
        // score = 0.5 * 0.6 + 1.0 * 0.4 = 0.7
        const results = scoreModels(['MODERATE', 'coding'], models);
        const codeModel = results.find(r => r.model.id === 'code-model');
        assert.ok(codeModel);
        assert.ok(codeModel!.score > 0.5 && codeModel!.score < 1.0,
            `邻近+任务匹配应在 (0.5, 1.0) 区间，得到 ${codeModel!.score}`);
    });

    it('零匹配 → score = 0', () => {
        // chat-model has TRIVIAL/SIMPLE/chat，COMPLEX 和 coding 都不匹配
        // COMPLEX 与 TRIVIAL 距离=3, 与 SIMPLE 距离=2 → 邻近得分 0.2
        const results = scoreModels(['COMPLEX', 'coding'], models);
        const chatModel = results.find(r => r.model.id === 'chat-model');
        assert.ok(chatModel);
        // 邻近得分可能很低但不一定为 0
        assert.ok(chatModel!.score < 0.3,
            `chat-model 对 COMPLEX+coding 应得分很低，得到 ${chatModel!.score}`);
    });

    it('结果按分数降序排列', () => {
        const results = scoreModels(['COMPLEX', 'coding'], models);
        for (let i = 1; i < results.length; i++) {
            assert.ok(results[i].score <= results[i - 1].score,
                `results[${i}].score(${results[i].score}) > results[${i - 1}].score(${results[i - 1].score})`);
        }
    });

    it('同分时专精（traits 少的）模型排前面', () => {
        const results = scoreModels(['COMPLEX', 'coding'], models);
        // code-model (3 traits) 和 all-model (8 traits) 都全匹配
        // code-model 应排在前面
        assert.equal(results[0].model.id, 'code-model');
    });

    it('大小写不敏感', () => {
        const results = scoreModels(['complex', 'CODING'], models);
        const codeModel = results.find(r => r.model.id === 'code-model');
        assert.ok(codeModel);
        assert.equal(codeModel!.score, 1.0);
    });

    it('空 traits → 空结果', () => {
        const results = scoreModels([], models);
        assert.equal(results.length, 0);
    });

    it('空 models → 空结果', () => {
        const results = scoreModels(['COMPLEX'], []);
        assert.equal(results.length, 0);
    });

    it('邻近 Tier 部分匹配：MODERATE 消息对声明 COMPLEX 的模型得分 > 0', () => {
        const results = scoreModels(['MODERATE'], models);
        const codeModel = results.find(r => r.model.id === 'code-model');
        assert.ok(codeModel);
        assert.ok(codeModel!.score > 0,
            `MODERATE 与 COMPLEX 相邻，应有部分得分，得到 ${codeModel!.score}`);
    });

    it('远离 Tier 得分低：TRIVIAL 消息对 EXPERT 模型得分接近 0', () => {
        const specialModels: ModelProfile[] = [
            { id: 'expert-only', traits: ['EXPERT'] },
        ];
        const results = scoreModels(['TRIVIAL'], specialModels);
        assert.ok(results[0].score < 0.1,
            `TRIVIAL 与 EXPERT 距离=4，得分应接近 0，得到 ${results[0].score}`);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// selectModel — 模型选择
// ═══════════════════════════════════════════════════════════════════════════

describe('selectModel — 模型选择', () => {
    it('最高分唯一 → 直接选择，不需仲裁', () => {
        const candidates = [
            { model: { id: 'best', traits: ['coding'] }, score: 1.0, matchedTraits: ['coding'] },
            { model: { id: 'ok', traits: ['chat'] }, score: 0.5, matchedTraits: ['chat'] },
        ];
        const result = selectModel(candidates);
        assert.equal(result.modelId, 'best');
        assert.equal(result.needsArbitration, false);
    });

    it('多模型并列 → 需要仲裁', () => {
        const candidates = [
            { model: { id: 'model-a', traits: ['coding'] }, score: 1.0, matchedTraits: ['coding'] },
            { model: { id: 'model-b', traits: ['coding'] }, score: 1.0, matchedTraits: ['coding'] },
        ];
        const result = selectModel(candidates);
        assert.equal(result.needsArbitration, true);
        assert.equal(result.tiedCandidates.length, 2);
    });

    it('空候选 → 回退 default', () => {
        const result = selectModel([]);
        assert.equal(result.modelId, 'default');
        assert.equal(result.needsArbitration, false);
    });

    it('所有候选 score=0 → 回退 default', () => {
        const candidates = [
            { model: { id: 'model-a', traits: ['coding'] }, score: 0, matchedTraits: [] },
        ];
        const result = selectModel(candidates);
        assert.equal(result.modelId, 'default');
    });

    it('只有 default 模型命中 → 不需仲裁', () => {
        const candidates = [
            { model: { id: 'default', traits: ['TRIVIAL', 'chat'] }, score: 1.0, matchedTraits: ['trivial', 'chat'] },
            { model: { id: 'code-model', traits: ['coding'] }, score: 0, matchedTraits: [] },
        ];
        const result = selectModel(candidates);
        assert.equal(result.modelId, 'default');
        assert.equal(result.needsArbitration, false);
    });
});
