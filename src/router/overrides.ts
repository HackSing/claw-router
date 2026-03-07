/**
 * @aiwaretop/claw-router — Hard-Rule Overrides
 *
 * These rules run *before* the scoring engine and can force a tier
 * without going through dimension scoring. They are evaluated in order;
 * the first match wins.
 */

import { Tier } from './types';

export interface OverrideResult {
  tier: Tier;
  rule: string;
}

/**
 * Evaluate hard-rule overrides against a raw message string.
 * Returns `null` when no override matches.
 */
export function checkOverrides(message: string): OverrideResult | null {
  // ── Rule 1: Extremely short, non-technical → TRIVIAL ──────────────────
  // "≤ 5 characters and no technical keywords"
  const stripped = message.replace(/\s+/g, '');
  if (stripped.length <= 5 && !hasTechToken(message)) {
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
  const expertPatterns = [
    '系统设计', '架构设计', '从零搭建',
    'system design', 'architecture design', 'build from scratch',
    '系统架构', '整体架构', '技术方案设计',
    'design a system', 'design the architecture',
  ];
  const lower = message.toLowerCase();
  for (const pat of expertPatterns) {
    if (lower.includes(pat.toLowerCase())) {
      return { tier: Tier.EXPERT, rule: `expert_keyword ("${pat}")` };
    }
  }

  // No override matched
  return null;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Quick check for common tech tokens that would disqualify Rule 1. */
function hasTechToken(msg: string): boolean {
  const techTokens = [
    'api', 'sql', 'css', 'html', 'http', 'json', 'yaml', 'xml',
    'bug', 'git', 'npm', 'pip', 'ssh', 'tcp', 'udp', 'url',
    'dns', 'jwt', 'rpc', 'sdk', 'ide', 'cli', 'gpu', 'cpu',
    '代码', '函数', '算法', '编程', '调试', '接口', '数据库',
    'code', 'func', 'def', 'var', 'let', 'int',
  ];
  const lower = msg.toLowerCase();
  return techTokens.some(t => lower.includes(t));
}
