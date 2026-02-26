"use strict";
/**
 * @aiwaretop/claw-router — Hard-Rule Overrides
 *
 * These rules run *before* the scoring engine and can force a tier
 * without going through dimension scoring. They are evaluated in order;
 * the first match wins.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkOverrides = checkOverrides;
var types_1 = require("./types");
/**
 * Evaluate hard-rule overrides against a raw message string.
 * Returns `null` when no override matches.
 */
function checkOverrides(message) {
    // ── Rule 1: Extremely short, non-technical → TRIVIAL ──────────────────
    // "≤ 5 characters and no technical keywords"
    var stripped = message.replace(/\s+/g, '');
    if (stripped.length <= 5 && !hasTechToken(message)) {
        return { tier: types_1.Tier.TRIVIAL, rule: 'short_nontechnical (≤5 chars)' };
    }
    // ── Rule 2: 3+ code fences → COMPLEX ─────────────────────────────────
    var fenceCount = (message.match(/```/g) || []).length;
    // each code block has opening + closing = 2 fences, but unclosed blocks count too
    // we count the raw ``` occurrences; 3+ means at least one and a half blocks
    if (fenceCount >= 3) {
        return { tier: types_1.Tier.COMPLEX, rule: 'multiple_code_blocks (≥3 fences)' };
    }
    // ── Rule 3: Architecture / system-design keywords → EXPERT ────────────
    var expertPatterns = [
        '系统设计', '架构设计', '从零搭建',
        'system design', 'architecture design', 'build from scratch',
        '系统架构', '整体架构', '技术方案设计',
        'design a system', 'design the architecture',
    ];
    var lower = message.toLowerCase();
    for (var _i = 0, expertPatterns_1 = expertPatterns; _i < expertPatterns_1.length; _i++) {
        var pat = expertPatterns_1[_i];
        if (lower.includes(pat.toLowerCase())) {
            return { tier: types_1.Tier.EXPERT, rule: "expert_keyword (\"".concat(pat, "\")") };
        }
    }
    // No override matched
    return null;
}
// ── Helpers ─────────────────────────────────────────────────────────────────
/** Quick check for common tech tokens that would disqualify Rule 1. */
function hasTechToken(msg) {
    var techTokens = [
        'api', 'sql', 'css', 'html', 'http', 'json', 'yaml', 'xml',
        'bug', 'git', 'npm', 'pip', 'ssh', 'tcp', 'udp', 'url',
        'dns', 'jwt', 'rpc', 'sdk', 'ide', 'cli', 'gpu', 'cpu',
        '代码', '函数', '算法', '编程', '调试', '接口', '数据库',
        'code', 'func', 'def', 'var', 'let', 'int',
    ];
    var lower = msg.toLowerCase();
    return techTokens.some(function (t) { return lower.includes(t); });
}
