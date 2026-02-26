/**
 * @aiwaretop/claw-router — Engine Tests
 *
 * 端到端测试：message → route() → 正确的 tier。
 * 使用 Node.js 内置 test runner (node:test)。
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { route, scoreOnly, isNearBoundary } from '../src/router/engine';
import { resolveConfig } from '../src/config';
import { Tier, TIER_ORDER, DEFAULT_THRESHOLDS } from '../src/router/types';
import { fixtures } from './fixtures';

const config = resolveConfig();

// ── Helper: 允许 ±1 tier 容差 ─────────────────────────────────────────────
function tierIndex(t: Tier): number { return TIER_ORDER.indexOf(t); }

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

  it('custom config overrides defaults', async () => {
    const custom = resolveConfig({
      tiers: { TRIVIAL: { primary: 'my-fast-model' } },
      thresholds: [0.10, 0.30, 0.50, 0.70],
    });
    const decision = await route('hi', custom);
    assert.equal(decision.model, 'my-fast-model');
  });
});

describe('isNearBoundary — 边界检测', () => {
  it('分数在阈值 ±0.08 内时返回 true', () => {
    // DEFAULT_THRESHOLDS = [0.15, 0.40, 0.55, 0.75]
    assert.ok(isNearBoundary(0.15, DEFAULT_THRESHOLDS));  // 正好在阈值上
    assert.ok(isNearBoundary(0.10, DEFAULT_THRESHOLDS));  // 0.15 - 0.05
    assert.ok(isNearBoundary(0.22, DEFAULT_THRESHOLDS));  // 0.15 + 0.07
    assert.ok(isNearBoundary(0.45, DEFAULT_THRESHOLDS));  // 0.40 + 0.05
    assert.ok(isNearBoundary(0.70, DEFAULT_THRESHOLDS));  // 0.75 - 0.05
  });

  it('分数远离所有阈值时返回 false', () => {
    assert.ok(!isNearBoundary(0.00, DEFAULT_THRESHOLDS));
    assert.ok(!isNearBoundary(0.28, DEFAULT_THRESHOLDS));
    assert.ok(!isNearBoundary(0.90, DEFAULT_THRESHOLDS));
  });
});
