/**
 * @aiwaretop/claw-router — Hard-Rule Overrides
 *
 * These rules run *before* the scoring engine and can force a tier
 * without going through dimension scoring. They are evaluated in order;
 * the first match wins.
 */

import { Tier } from './types';
import { extractSemanticSignals } from './semantic-signals';

export interface OverrideResult {
  tier: Tier;
  rule: string;
}

/**
 * Evaluate hard-rule overrides against a raw message string.
 * Returns `null` when no override matches.
 */
export function checkOverrides(message: string): OverrideResult | null {
  const signals = extractSemanticSignals(message);

  // ── Rule 1: Extremely short, non-technical → TRIVIAL ──────────────────
  // "≤ 5 characters and low tech context"
  const stripped = message.replace(/\s+/g, '');
  if (stripped.length <= 5 && signals.techContext < 0.35) {
    return { tier: Tier.TRIVIAL, rule: 'short_nontechnical (≤5 chars)' };
  }

  // ── Rule 2: 3+ code fences → COMPLEX（需满足代码量条件）────────────
  const fenceCount = (message.match(/```/g) || []).length;
  if (fenceCount >= 3) {
    // 统计围栏内代码行数，排除简单配置粘贴
    const codeBlocks = message.match(/```[\s\S]*?```/g) || [];
    const totalCodeLines = codeBlocks.reduce((sum, block) => {
      const lines = block.split('\n').length - 2; // 减去开头和结尾的 ```
      return sum + Math.max(0, lines);
    }, 0);
    // 6+ 围栏（3+ 代码块）或代码量 >= 10 行时强制 COMPLEX
    if (fenceCount >= 6 || totalCodeLines >= 10) {
      return { tier: Tier.COMPLEX, rule: 'multiple_code_blocks (≥3 fences, substantial code)' };
    }
  }

  // ── Rule 3: Architecture / system-design keywords → EXPERT ────────────
  if (signals.architectureIntent >= 0.8) {
    return { tier: Tier.EXPERT, rule: 'architecture_intent' };
  }

  // No override matched
  return null;
}
