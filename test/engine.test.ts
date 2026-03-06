/**
 * @aiwaretop/claw-router — Engine Tests
 *
 * 端到端测试：message → route() → 正确的 tier + 模型匹配。
 * 使用 Node.js 内置 test runner (node:test)。
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { route, scoreOnly, isNearBoundary } from '../src/router/engine';
import { resolveConfig } from '../src/config';
import { Tier, TIER_ORDER, DEFAULT_THRESHOLDS } from '../src/router/types';
import { fixtures } from './fixtures';
import { LlmScorer, type LlmScoreResult } from '../src/router/llm-scorer';

const config = resolveConfig();

// ── Helper ──────────────────────────────────────────────────────────────────
function tierIndex(t: Tier): number { return TIER_ORDER.indexOf(t); }

// ═══════════════════════════════════════════════════════════════════════════
// Routing Engine — fixture 端到端测试
// ═══════════════════════════════════════════════════════════════════════════

describe('Routing Engine — fixture tests', () => {
  for (const tc of fixtures) {
    it(`[${tc.id}] ${tc.description} → ${tc.expectedTier}`, async () => {
      const decision = await route(tc.message, config);
      const actual = decision.tier;
      const expected = tc.expectedTier;

      if (tc.isOverride) {
        assert.equal(actual, expected,
          `Override: expected ${expected}, got ${actual} (rule: ${decision.score.overrideApplied})`);
      } else {
        const diff = Math.abs(tierIndex(actual) - tierIndex(expected));
        assert.ok(diff <= 1,
          `Expected ~${expected} (±1 tier), got ${actual} (score: ${decision.score.calibrated.toFixed(4)})`);
      }
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Routing Engine — 核心属性测试
// ═══════════════════════════════════════════════════════════════════════════

describe('Routing Engine — core properties', () => {
  it('latency < 5ms for typical message (no LLM)', async () => {
    const decision = await route('请帮我写一个 Python 函数来排序数组', config);
    assert.ok(decision.latencyMs < 5, `Took ${decision.latencyMs} ms`);
  });

  it('score is always 0–1', () => {
    const messages = ['', 'hi', 'x'.repeat(5000), '```js\ncode\n```\n'.repeat(10)];
    for (const m of messages) {
      const score = scoreOnly(m, config);
      assert.ok(score.calibrated >= 0 && score.calibrated <= 1,
        `Calibrated score ${score.calibrated} out of range for message length ${m.length}`);
    }
  });

  it('longer/more complex messages score higher', () => {
    const simple = scoreOnly('hi', config);
    const complex = scoreOnly(
      '请设计一个高并发微服务架构，包括服务发现、负载均衡、熔断器、分布式追踪、' +
      '数据库分片策略，并使用 Kubernetes 部署。需要详细的代码示例和性能分析。',
      config,
    );
    assert.ok(complex.calibrated > simple.calibrated,
      `Complex (${complex.calibrated}) should score higher than simple (${simple.calibrated})`);
  });

  it('explicit /model is not routed (caller responsibility)', async () => {
    const decision = await route('/model gpt-4 tell me a joke', config);
    assert.ok(decision.tier, 'Should still produce a tier');
  });

  it('custom config with models overrides defaults', async () => {
    const custom = resolveConfig({
      models: [
        { id: 'my-fast-model', traits: ['TRIVIAL', 'SIMPLE', 'chat'] },
      ],
      thresholds: [0.10, 0.30, 0.50, 0.70],
    });
    const decision = await route('hi', custom);
    // TRIVIAL tier + chat taskType → my-fast-model 应匹配
    assert.equal(decision.model, 'my-fast-model');
  });

  it('route decision includes matchSource', async () => {
    const decision = await route('写个函数', config);
    assert.ok(decision.matchSource, 'Should have matchSource');
    assert.ok(['trait', 'llm_arbitration', 'default'].includes(decision.matchSource));
  });

  it('route decision includes candidates array', async () => {
    const decision = await route('写个函数', config);
    assert.ok(Array.isArray(decision.candidates), 'Should have candidates array');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// isNearBoundary — 边界检测
// ═══════════════════════════════════════════════════════════════════════════

describe('isNearBoundary — 边界检测', () => {
  // DEFAULT_THRESHOLDS = [0.20, 0.42, 0.58, 0.78]
  it('分数正好在阈值上时返回 true', () => {
    assert.ok(isNearBoundary(0.20, DEFAULT_THRESHOLDS));
    assert.ok(isNearBoundary(0.42, DEFAULT_THRESHOLDS));
    assert.ok(isNearBoundary(0.58, DEFAULT_THRESHOLDS));
    assert.ok(isNearBoundary(0.78, DEFAULT_THRESHOLDS));
  });

  it('分数在阈值 ±0.08 内时返回 true', () => {
    assert.ok(isNearBoundary(0.13, DEFAULT_THRESHOLDS));  // 0.20 - 0.07
    assert.ok(isNearBoundary(0.27, DEFAULT_THRESHOLDS));  // 0.20 + 0.07
    assert.ok(isNearBoundary(0.35, DEFAULT_THRESHOLDS));  // 0.42 - 0.07
    assert.ok(isNearBoundary(0.49, DEFAULT_THRESHOLDS));  // 0.42 + 0.07
    assert.ok(isNearBoundary(0.51, DEFAULT_THRESHOLDS));  // 0.58 - 0.07
    assert.ok(isNearBoundary(0.72, DEFAULT_THRESHOLDS));  // 0.78 - 0.06
  });

  it('分数远离所有阈值时返回 false', () => {
    assert.ok(!isNearBoundary(0.00, DEFAULT_THRESHOLDS));
    assert.ok(!isNearBoundary(0.31, DEFAULT_THRESHOLDS));  // 在 0.20 和 0.42 中间
    assert.ok(!isNearBoundary(0.95, DEFAULT_THRESHOLDS));
  });

  it('支持自定义 delta', () => {
    assert.ok(isNearBoundary(0.19, DEFAULT_THRESHOLDS, 0.02));   // 0.20 - 0.01
    assert.ok(!isNearBoundary(0.15, DEFAULT_THRESHOLDS, 0.02));  // 0.20 - 0.05，超出 delta=0.02
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// scoreOnly — 校准与评分
// ═══════════════════════════════════════════════════════════════════════════

describe('scoreOnly — 校准与评分', () => {
  it('短消息评分低（但 sigmoid > 0）', () => {
    const score = scoreOnly('今天天气怎么样', config);
    assert.ok(score.calibrated > 0 && score.calibrated < 0.5,
      `Short message calibrated=${score.calibrated}, expected 0 < x < 0.5`);
  });

  it('sigmoid 输出单调递增', () => {
    const msgs = ['hi', '写个脚本', '用 Python 写一个爬虫，处理反爬和分页', '设计一个微服务架构，包含服务发现、负载均衡、熔断器'];
    let prev = 0;
    for (const m of msgs) {
      const score = scoreOnly(m, config);
      assert.ok(score.calibrated >= prev,
        `Score should increase: prev=${prev.toFixed(4)}, current=${score.calibrated.toFixed(4)} for "${m.substring(0, 20)}"`);
      prev = score.calibrated;
    }
  });

  it('sigmoid 输出为正数且小于 1', () => {
    const low = scoreOnly('今天天气怎么样', config);
    const high = scoreOnly(
      '请设计一个分布式系统，包含微服务架构，数据库分片，消息队列，' +
      '实现高可用、高并发、容错、监控、日志、链路追踪、负载均衡的完整方案',
      config,
    );
    assert.ok(low.calibrated > 0, `Low score ${low.calibrated} should be > 0`);
    assert.ok(high.calibrated < 1, `High score ${high.calibrated} should be < 1`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// LLM Scorer — 单元测试
// ═══════════════════════════════════════════════════════════════════════════

describe('LlmScorer — parseResponse & convertToScoreResult', () => {
  const mockInvoke = async (_model: string, _prompt: string) => '';
  const scorer = new LlmScorer({ enabled: true, model: 'test' }, mockInvoke);

  it('convertToScoreResult: TRIVIAL → calibrated ≈ 0.08', () => {
    const result = scorer.convertToScoreResult({ tier: Tier.TRIVIAL, confidence: 0.9, reasoning: 'test' });
    assert.equal(result.tier, Tier.TRIVIAL);
    assert.equal(result.calibrated, 0.08);
    assert.equal(result.dimensions.length, 8);
  });

  it('convertToScoreResult: EXPERT → calibrated ≈ 0.88', () => {
    const result = scorer.convertToScoreResult({ tier: Tier.EXPERT, confidence: 0.95, reasoning: 'test' });
    assert.equal(result.tier, Tier.EXPERT);
    assert.equal(result.calibrated, 0.88);
  });

  it('convertToScoreResult: 所有维度 raw 为 0', () => {
    const result = scorer.convertToScoreResult({ tier: Tier.MODERATE, confidence: 0.8, reasoning: 'test' });
    for (const dim of result.dimensions) {
      assert.equal(dim.raw, 0);
      assert.equal(dim.weighted, 0);
    }
  });

  it('evaluate: LLM 返回合法 JSON 时正确解析', async () => {
    const mockInvokeOk = async () => '```json\n{"tier":"COMPLEX","confidence":0.85,"reasoning":"需要多步技术实现"}\n```';
    const s = new LlmScorer({ enabled: true, model: 'test' }, mockInvokeOk);
    const result = await s.evaluate('test message');
    assert.ok(result);
    assert.equal(result!.tier, Tier.COMPLEX);
    assert.equal(result!.confidence, 0.85);
    assert.equal(result!.reasoning, '需要多步技术实现');
  });

  it('evaluate: LLM 返回非 JSON 时返回 null', async () => {
    const mockInvokeBad = async () => 'I cannot classify this message';
    const s = new LlmScorer({ enabled: true, model: 'test' }, mockInvokeBad);
    const result = await s.evaluate('test message');
    assert.equal(result, null);
  });

  it('evaluate: LLM 抛异常时返回 null（不会崩溃）', async () => {
    const mockInvokeErr = async () => { throw new Error('网络超时'); };
    const s = new LlmScorer({ enabled: true, model: 'test' }, mockInvokeErr);
    const result = await s.evaluate('test message');
    assert.equal(result, null);
  });

  it('evaluate: confidence 超出范围时 clamp 到 [0, 1]', async () => {
    const mockInvoke2 = async () => '{"tier":"SIMPLE","confidence":1.5,"reasoning":"test"}';
    const s = new LlmScorer({ enabled: true, model: 'test' }, mockInvoke2);
    const result = await s.evaluate('test');
    assert.ok(result);
    assert.equal(result!.confidence, 1.0);
  });

  it('evaluate: 未识别的 tier 字符串回退到 SIMPLE', async () => {
    const mockInvoke3 = async () => '{"tier":"UNKNOWN","confidence":0.5,"reasoning":"test"}';
    const s = new LlmScorer({ enabled: true, model: 'test' }, mockInvoke3);
    const result = await s.evaluate('test');
    assert.ok(result);
    assert.equal(result!.tier, Tier.SIMPLE);
  });

  it('evaluate: enabled=false 时直接返回 null', async () => {
    const s = new LlmScorer({ enabled: false, model: 'test' }, mockInvoke);
    const result = await s.evaluate('test');
    assert.equal(result, null);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// LLM Scorer — 仲裁测试
// ═══════════════════════════════════════════════════════════════════════════

describe('LlmScorer — arbitrate', () => {
  it('仲裁返回合法 JSON 时正确解析', async () => {
    const mockInvoke = async () => '{"model":"anthropic/claude-sonnet","reasoning":"代码任务更适合 Claude"}';
    const scorer = new LlmScorer({ enabled: true, model: 'test' }, mockInvoke);
    const candidates = [
      { model: { id: 'anthropic/claude-sonnet', traits: ['coding', 'COMPLEX'] }, score: 1, matchedTraits: ['coding', 'COMPLEX'] },
      { model: { id: 'openai/gpt-4o', traits: ['coding', 'COMPLEX'] }, score: 1, matchedTraits: ['coding', 'COMPLEX'] },
    ];
    const result = await scorer.arbitrate('写代码', candidates);
    assert.ok(result);
    assert.equal(result!.model, 'anthropic/claude-sonnet');
  });

  it('仲裁返回不在候选列表中的 model 时返回 null', async () => {
    const mockInvoke = async () => '{"model":"unknown-model","reasoning":"test"}';
    const scorer = new LlmScorer({ enabled: true, model: 'test' }, mockInvoke);
    const candidates = [
      { model: { id: 'model-a', traits: ['coding'] }, score: 1, matchedTraits: ['coding'] },
    ];
    const result = await scorer.arbitrate('test', candidates);
    assert.equal(result, null);
  });

  it('仲裁 enabled=false 时返回 null', async () => {
    const scorer = new LlmScorer({ enabled: false, model: 'test' }, async () => '');
    const result = await scorer.arbitrate('test', []);
    assert.equal(result, null);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 真实边界消息端到端测试
// ═══════════════════════════════════════════════════════════════════════════

describe('Routing — 边界消息行为', () => {
  it('技术词免于 short override 规则但仍可能评分低', async () => {
    const decision = await route('git', config);
    assert.ok(decision.score.overrideApplied === undefined || !decision.score.overrideApplied.includes('short_nontechnical'),
      'Should not be overridden by short_nontechnical rule');
  });

  it('多个代码块触发 COMPLEX override', async () => {
    const msg = '```js\na\n```\n```py\nb\n```\n```go\nc\n```';
    const decision = await route(msg, config);
    assert.equal(decision.tier, Tier.COMPLEX);
    assert.ok(decision.score.overrideApplied?.includes('code_blocks'));
  });

  it('route 结果包含完整的维度信息', async () => {
    const decision = await route('帮我用 Python 写一个机器学习模型', config);
    assert.ok(decision.score.dimensions.length === 8);
    assert.ok(decision.latencyMs >= 0);
    assert.ok(decision.model);
    assert.ok(decision.taskType);
    assert.ok(decision.matchSource);
  });

  it('default config 路由到 default 模型', async () => {
    const decisions = await Promise.all([
      route('你好', config),
      route('写个函数', config),
    ]);
    for (const d of decisions) {
      assert.equal(d.model, 'default');
    }
  });

  it('trait 匹配正确路由到配置的模型', async () => {
    const custom = resolveConfig({
      models: [
        // 覆盖所有可能的编程 tier（SIMPLE 到 EXPERT）
        { id: 'code-model', traits: ['coding', 'SIMPLE', 'MODERATE', 'COMPLEX', 'EXPERT'] },
        { id: 'chat-model', traits: ['chat', 'TRIVIAL', 'SIMPLE'] },
      ],
    });
    const codingDecision = await route('用 Python 实现一个排序算法', custom);
    const chatDecision = await route('你好', custom);

    // 编程任务应路由到 code-model
    assert.equal(codingDecision.model, 'code-model');
    // 闲聊应路由到 chat-model
    assert.equal(chatDecision.model, 'chat-model');
  });
});
