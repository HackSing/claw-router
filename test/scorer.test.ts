/**
 * @aiwaretop/claw-router — Scorer Tests
 *
 * Unit tests for the 8-dimension scoring engine and overrides.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scoreDimensions } from '../src/router/scorer';
import { checkOverrides } from '../src/router/overrides';
import { Dimension, DEFAULT_WEIGHTS, Tier } from '../src/router/types';

describe('Scorer — dimension scoring', () => {
  it('empty message produces near-zero scores', () => {
    const dims = scoreDimensions('', DEFAULT_WEIGHTS);
    const total = dims.reduce((s, d) => s + d.raw, 0);
    assert.ok(total < 0.1, `Empty message total raw score should be ~0, got ${total}`);
  });

  it('code-heavy message scores high on codeTech', () => {
    const msg = 'Write a Python function using async/await to handle concurrent API requests';
    const dims = scoreDimensions(msg, DEFAULT_WEIGHTS);
    const codeDim = dims.find(d => d.dimension === Dimension.CODE_TECH)!;
    assert.ok(codeDim.raw > 0.3, `codeTech should be > 0.3, got ${codeDim.raw}`);
  });

  it('reasoning-heavy message scores high on reasoning', () => {
    const msg = '请分析这个问题的根本原因，推理出逻辑关系，论证你的假设';
    const dims = scoreDimensions(msg, DEFAULT_WEIGHTS);
    const dim = dims.find(d => d.dimension === Dimension.REASONING)!;
    assert.ok(dim.raw > 0.4, `reasoning should be > 0.4, got ${dim.raw}`);
  });

  it('creative message scores high on creativity', () => {
    const msg = '写一篇科幻故事，想象2050年的世界';
    const dims = scoreDimensions(msg, DEFAULT_WEIGHTS);
    const dim = dims.find(d => d.dimension === Dimension.CREATIVITY)!;
    assert.ok(dim.raw > 0.3, `creativity should be > 0.3, got ${dim.raw}`);
  });

  it('step-by-step message scores high on taskSteps', () => {
    const msg = 'Step 1: install dependencies. Step 2: configure the database. Step 3: run migrations. Finally, deploy.';
    const dims = scoreDimensions(msg, DEFAULT_WEIGHTS);
    const dim = dims.find(d => d.dimension === Dimension.TASK_STEPS)!;
    assert.ok(dim.raw > 0.3, `taskSteps should be > 0.3, got ${dim.raw}`);
  });

  it('domain-heavy message scores high on domainExpert', () => {
    const msg = '量子计算中的拓扑量子比特如何实现容错？请结合神经网络和深度学习分析';
    const dims = scoreDimensions(msg, DEFAULT_WEIGHTS);
    const dim = dims.find(d => d.dimension === Dimension.DOMAIN_EXPERT)!;
    assert.ok(dim.raw > 0.4, `domainExpert should be > 0.4, got ${dim.raw}`);
  });

  it('structured output request scores on outputComplex', () => {
    const msg = '请用 JSON 格式输出一个 Markdown 表格模板';
    const dims = scoreDimensions(msg, DEFAULT_WEIGHTS);
    const dim = dims.find(d => d.dimension === Dimension.OUTPUT_COMPLEX)!;
    assert.ok(dim.raw > 0.3, `outputComplex should be > 0.3, got ${dim.raw}`);
  });

  it('long message scores high on messageLength', () => {
    const msg = '这是一段很长的消息。'.repeat(100);
    const dims = scoreDimensions(msg, DEFAULT_WEIGHTS);
    const dim = dims.find(d => d.dimension === Dimension.MESSAGE_LENGTH)!;
    assert.ok(dim.raw > 0.6, `messageLength should be > 0.6, got ${dim.raw}`);
  });

  it('all dimension scores are 0–1', () => {
    const messages = [
      '', 'hi', '请帮我分析一下这个复杂的量子算法的代码实现',
      'x'.repeat(3000),
    ];
    for (const msg of messages) {
      const dims = scoreDimensions(msg, DEFAULT_WEIGHTS);
      for (const d of dims) {
        assert.ok(d.raw >= 0 && d.raw <= 1,
          `${d.dimension} raw=${d.raw} out of [0,1] for msg length ${msg.length}`);
      }
    }
  });
});

describe('Overrides — hard rules', () => {
  it('short non-technical → TRIVIAL', () => {
    const r = checkOverrides('嗯');
    assert.ok(r !== null);
    assert.equal(r!.tier, Tier.TRIVIAL);
  });

  it('short tech word does NOT trigger trivial override', () => {
    const r = checkOverrides('API');
    // "API" is a tech token → Rule 1 should NOT fire
    assert.equal(r, null);
  });

  it('3+ code fences → COMPLEX', () => {
    const msg = '```a\n```\n```b\n```';
    const r = checkOverrides(msg);
    assert.ok(r !== null);
    assert.equal(r!.tier, Tier.COMPLEX);
  });

  it('系统设计 → EXPERT', () => {
    const r = checkOverrides('请做一个系统设计');
    assert.ok(r !== null);
    assert.equal(r!.tier, Tier.EXPERT);
  });

  it('从零搭建 → EXPERT', () => {
    const r = checkOverrides('从零搭建一个微服务');
    assert.ok(r !== null);
    assert.equal(r!.tier, Tier.EXPERT);
  });

  it('system design (English) → EXPERT', () => {
    const r = checkOverrides('Design a system for authentication');
    assert.ok(r !== null);
    assert.equal(r!.tier, Tier.EXPERT);
  });

  it('no override for normal message', () => {
    const r = checkOverrides('帮我翻译一下这段话');
    assert.equal(r, null);
  });
});
