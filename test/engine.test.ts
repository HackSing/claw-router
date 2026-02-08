/**
 * @aiwaretop/claw-router — Engine Tests
 *
 * End-to-end tests: message → route() → correct tier.
 * Uses Node's built-in test runner (node:test).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { route, scoreOnly } from '../src/router/engine';
import { resolveConfig } from '../src/config';
import { Tier, TIER_ORDER } from '../src/router/types';
import { fixtures } from './fixtures';

const config = resolveConfig();

// ── Helper: allow ±1 tier tolerance for non-override edge cases ─────────
function tierIndex(t: Tier): number { return TIER_ORDER.indexOf(t); }

describe('Routing Engine — fixture tests', () => {
  for (const tc of fixtures) {
    it(`[${tc.id}] ${tc.description} → ${tc.expectedTier}`, () => {
      const decision = route(tc.message, config);
      const actual = decision.tier;
      const expected = tc.expectedTier;

      if (tc.isOverride) {
        // Override cases must match exactly
        assert.equal(actual, expected,
          `Override: expected ${expected}, got ${actual} (rule: ${decision.score.overrideApplied})`);
      } else {
        // Non-override: allow ±1 tier tolerance (scoring is heuristic)
        const diff = Math.abs(tierIndex(actual) - tierIndex(expected));
        assert.ok(diff <= 1,
          `Expected ~${expected} (±1 tier), got ${actual} (score: ${decision.score.calibrated.toFixed(4)})`);
      }
    });
  }
});

describe('Routing Engine — core properties', () => {
  it('latency < 5ms for typical message', () => {
    const decision = route('请帮我写一个 Python 函数来排序数组', config);
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

  it('explicit /model is not routed (caller responsibility)', () => {
    // The router itself doesn't handle /model — the plugin entry skips calling route.
    // But we ensure the router can still score such messages without error.
    const decision = route('/model gpt-4 tell me a joke', config);
    assert.ok(decision.tier, 'Should still produce a tier');
  });

  it('custom config overrides defaults', () => {
    const custom = resolveConfig({
      tiers: { TRIVIAL: { primary: 'my-fast-model' } },
      thresholds: [0.10, 0.30, 0.50, 0.70],
    });
    const decision = route('hi', custom);
    assert.equal(decision.model, 'my-fast-model');
  });
});
