/**
 * @aiwaretop/claw-router — Task Classifier Tests
 *
 * 任务类型分类器的单元测试。
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyTask } from '../src/router/task-classifier';
import { TaskType } from '../src/router/types';
import { route } from '../src/router/engine';
import { resolveConfig } from '../src/config';

// ═══════════════════════════════════════════════════════════════════════════
// 任务分类器 — 单元测试
// ═══════════════════════════════════════════════════════════════════════════

describe('Task Classifier — classifyTask', () => {
    // ── CODING ──────────────────────────────────────────────────────────────
    it('编程请求 → CODING', () => {
        assert.equal(classifyTask('帮我用 Python 写一个函数来排序数组'), TaskType.CODING);
    });

    it('调试请求 → CODING', () => {
        assert.equal(classifyTask('这段代码有 bug，帮我调试一下'), TaskType.CODING);
    });

    it('英文编程请求 → CODING', () => {
        assert.equal(classifyTask('Write a TypeScript function that implements binary search'), TaskType.CODING);
    });

    it('包含代码块 → CODING', () => {
        assert.equal(classifyTask('看看这段代码：\n```python\ndef foo(): pass\n```'), TaskType.CODING);
    });

    it('重构请求 → CODING', () => {
        assert.equal(classifyTask('帮我重构这个 React 组件'), TaskType.CODING);
    });

    // ── WRITING ─────────────────────────────────────────────────────────────
    it('写文章请求 → WRITING', () => {
        assert.equal(classifyTask('帮我写一篇关于人工智能的文章'), TaskType.WRITING);
    });

    it('创作故事 → WRITING', () => {
        assert.equal(classifyTask('创作一个科幻故事，想象2050年的世界'), TaskType.WRITING);
    });

    it('英文写作请求 → WRITING', () => {
        assert.equal(classifyTask('Write a blog post about remote work benefits'), TaskType.WRITING);
    });

    it('写诗 → WRITING', () => {
        assert.equal(classifyTask('帮我写一首关于春天的诗'), TaskType.WRITING);
    });

    // ── CHAT ────────────────────────────────────────────────────────────────
    it('问候 → CHAT', () => {
        assert.equal(classifyTask('你好，最近怎么样'), TaskType.CHAT);
    });

    it('空消息 → CHAT', () => {
        assert.equal(classifyTask(''), TaskType.CHAT);
    });

    it('英文问候 → CHAT', () => {
        assert.equal(classifyTask('Hello, how are you?'), TaskType.CHAT);
    });

    it('感谢 → CHAT', () => {
        assert.equal(classifyTask('谢谢你的帮助'), TaskType.CHAT);
    });

    // ── ANALYSIS ────────────────────────────────────────────────────────────
    it('分析请求 → ANALYSIS', () => {
        assert.equal(classifyTask('分析一下这个方案的优缺点'), TaskType.ANALYSIS);
    });

    it('比较请求 → ANALYSIS', () => {
        assert.equal(classifyTask('对比分析 PostgreSQL 和 MySQL 的利弊'), TaskType.ANALYSIS);
    });

    it('英文分析请求 → ANALYSIS', () => {
        assert.equal(classifyTask('Analyze the pros and cons of microservices architecture'), TaskType.ANALYSIS);
    });

    // ── TRANSLATION ─────────────────────────────────────────────────────────
    it('翻译请求 → TRANSLATION', () => {
        assert.equal(classifyTask('帮我把这段话翻译成英文'), TaskType.TRANSLATION);
    });

    it('英文翻译请求 → TRANSLATION', () => {
        assert.equal(classifyTask('Translate this paragraph to Chinese'), TaskType.TRANSLATION);
    });

    it('中译英 → TRANSLATION', () => {
        assert.equal(classifyTask('中译英：今天天气很好'), TaskType.TRANSLATION);
    });

    // ── OTHER ────────────────────────────────────────────────────────────────
    it('简单事实问题 → OTHER', () => {
        // 没有明显任务类型特征
        assert.equal(classifyTask('日本的首都是什么'), TaskType.OTHER);
    });

    // ── MATH ─────────────────────────────────────────────────────────────────
    it('数学题 → MATH', () => {
        assert.equal(classifyTask('求解这个微积分方程'), TaskType.MATH);
    });

    it('概率统计 → MATH', () => {
        assert.equal(classifyTask('计算这个概率问题'), TaskType.MATH);
    });

    // ── RESEARCH ─────────────────────────────────────────────────────────────
    it('论文调研 → RESEARCH', () => {
        assert.equal(classifyTask('帮我调研关于大语言模型的最新论文'), TaskType.RESEARCH);
    });

    it('文献综述 → RESEARCH', () => {
        assert.equal(classifyTask('写一篇关于机器学习的文献综述'), TaskType.RESEARCH);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// 路由引擎 — trait-based 模型匹配集成测试
// ═══════════════════════════════════════════════════════════════════════════

describe('Route Engine — trait-based model matching', () => {
    it('未配置 models 时使用 default', async () => {
        const config = resolveConfig();
        const decision = await route('帮我写一篇关于人工智能的文章', config);
        assert.ok(decision.taskType, 'RouteDecision 应包含 taskType');
        assert.equal(decision.model, 'default');
    });

    it('编程消息匹配 coding trait 模型', async () => {
        const config = resolveConfig({
            models: [
                { id: 'anthropic/claude-sonnet', traits: ['coding', 'SIMPLE', 'MODERATE', 'COMPLEX', 'EXPERT'] },
            ],
        });
        const decision = await route('帮我用 Python 编程实现一个排序算法', config);
        assert.equal(decision.taskType, TaskType.CODING);
        assert.equal(decision.model, 'anthropic/claude-sonnet');
    });

    it('写作消息匹配 writing trait 模型', async () => {
        const config = resolveConfig({
            models: [
                { id: 'google/gemini-pro', traits: ['writing', 'SIMPLE', 'MODERATE', 'COMPLEX'] },
            ],
        });
        const decision = await route('帮我写一篇关于人工智能发展的文章', config);
        assert.equal(decision.taskType, TaskType.WRITING);
        assert.equal(decision.model, 'google/gemini-pro');
    });

    it('未匹配的任务类型回退到 default', async () => {
        const config = resolveConfig({
            models: [
                { id: 'anthropic/claude-sonnet', traits: ['coding', 'COMPLEX'] },
            ],
        });
        // 翻译消息，但只配了 coding 模型
        const decision = await route('帮我翻译这段话成英文', config);
        assert.equal(decision.taskType, TaskType.TRANSLATION);
        // coding 模型不匹配 translation，应回退到 default
        assert.notEqual(decision.model, 'anthropic/claude-sonnet');
    });

    it('RouteDecision 始终包含 taskType 和 matchSource', async () => {
        const config = resolveConfig();
        const decision = await route('hello', config);
        assert.ok('taskType' in decision);
        assert.ok('matchSource' in decision);
        assert.ok(Object.values(TaskType).includes(decision.taskType));
    });
});
