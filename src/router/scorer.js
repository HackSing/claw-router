"use strict";
/**
 * @aiwaretop/claw-router — 8-Dimension Scorer
 *
 * Pure-local, zero-dependency scorer that runs in < 1 ms.
 * Each dimension produces a 0–1 score using keyword matching
 * (substring + regex), structural analysis, and numeric heuristics.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.scoreDimensions = scoreDimensions;
var types_1 = require("./types");
var keywords_1 = require("./keywords");
// ── Public API ──────────────────────────────────────────────────────────────
/**
 * Score a message across all 8 dimensions.
 *
 * @param message  Raw user message
 * @param weights  Effective weight map (already merged with defaults)
 * @returns        Array of 8 DimensionScore objects
 */
function scoreDimensions(message, weights) {
    if (weights === void 0) { weights = types_1.DEFAULT_WEIGHTS; }
    var lower = message.toLowerCase();
    return Object.values(types_1.Dimension).map(function (dim) {
        var _a;
        var raw;
        switch (dim) {
            case types_1.Dimension.MESSAGE_LENGTH:
                raw = scoreLength(message);
                break;
            case types_1.Dimension.TASK_STEPS:
                raw = Math.max(scoreKeywords(lower, keywords_1.KEYWORDS[dim]), scoreStructuralSteps(message));
                break;
            case types_1.Dimension.CONTEXT_DEPEND:
                raw = Math.max(scoreKeywords(lower, keywords_1.KEYWORDS[dim]), scoreContextSignals(lower));
                break;
            case types_1.Dimension.CREATIVITY:
                // Boost creativity with task-request detection, but suppress if code/tech context
                raw = Math.max(scoreKeywords(lower, keywords_1.KEYWORDS[dim]), scoreCreativeRequest(lower));
                // Suppress creativity score when message is clearly a code/tech request
                if (isCodeContext(lower)) {
                    raw = raw * 0.15; // heavily dampen — "帮我写一个脚本" is not creative writing
                }
                break;
            case types_1.Dimension.CODE_TECH:
                raw = scoreKeywords(lower, keywords_1.KEYWORDS[dim]);
                // Dampen code score for simple single-task requests (short + no multi-step signals)
                if (raw > 0 && !hasComplexitySignals(lower) && message.length < 60) {
                    raw = raw * 0.50;
                }
                break;
            default:
                raw = scoreKeywords(lower, keywords_1.KEYWORDS[dim]);
        }
        // Add structural complexity bonus for dimensions that benefit from it
        if (dim === types_1.Dimension.REASONING) {
            raw = Math.max(raw, scoreReasoningStructure(lower));
        }
        var weight = (_a = weights[dim]) !== null && _a !== void 0 ? _a : types_1.DEFAULT_WEIGHTS[dim];
        return {
            dimension: dim,
            raw: clamp(raw),
            weight: weight,
            weighted: clamp(raw) * weight,
        };
    });
}
// ── Keyword-based scoring ───────────────────────────────────────────────────
/**
 * Aggregate keyword matches for a single dimension.
 *
 * Using a "soft max" approach: score = 1 - ∏(1 - wᵢ) for each match i,
 * which naturally saturates towards 1 without hard-clipping.
 */
function scoreKeywords(lowerMsg, entries) {
    var complement = 1.0;
    for (var _i = 0, entries_1 = entries; _i < entries_1.length; _i++) {
        var entry = entries_1[_i];
        var matched = entry.isRegex
            ? new RegExp(entry.pattern, 'i').test(lowerMsg)
            : lowerMsg.includes(entry.pattern.toLowerCase());
        if (matched) {
            complement *= (1 - entry.weight);
        }
    }
    return 1 - complement;
}
// ── Structural / heuristic scorers ──────────────────────────────────────────
/**
 * Detect multi-step structure from punctuation, numbering, connectives.
 * Works for both Chinese and English.
 */
function scoreStructuralSteps(message) {
    var score = 0;
    // Count Chinese comma-separated clauses (、or ，)
    var chineseCommas = (message.match(/[，、；]/g) || []).length;
    if (chineseCommas >= 3)
        score += 0.3;
    else if (chineseCommas >= 1)
        score += 0.15;
    // Count English commas
    var englishCommas = (message.match(/,/g) || []).length;
    if (englishCommas >= 3)
        score += 0.2;
    // Numbered lists (1. 2. or 1) 2) etc.)
    var numberedItems = (message.match(/(?:^|\n)\s*\d+[.)]/gm) || []).length;
    if (numberedItems >= 2)
        score += 0.4;
    // Multiple sentences (Chinese periods or English periods)
    var sentences = (message.match(/[。！？.!?]/g) || []).length;
    if (sentences >= 3)
        score += 0.25;
    // Bullet points
    var bullets = (message.match(/(?:^|\n)\s*[-*•]/gm) || []).length;
    if (bullets >= 2)
        score += 0.3;
    return clamp(score);
}
/**
 * Detect reasoning complexity from question structure and connectives.
 */
function scoreReasoningStructure(lower) {
    var score = 0;
    // Basic question presence (Chinese or English question marks)
    var qmarks = (lower.match(/[？?]/g) || []).length;
    if (qmarks >= 3)
        score += 0.40;
    else if (qmarks >= 2)
        score += 0.25;
    else if (qmarks >= 1)
        score += 0.10; // single question → mild signal
    // Chinese question words that signal inquiry — but mild for simple questions
    if (/怎么样|什么|怎么|如何|哪个|哪些|多少|几个|是否|能否|可以吗/i.test(lower))
        score += 0.10;
    // English simple question words — mild
    if (/\b(what|how|which|where|when|who)\b/i.test(lower))
        score += 0.08;
    // Conditional language → moderate reasoning
    if (/如果|假如|假设|若是|if\s|suppose|assuming|given\sthat/i.test(lower))
        score += 0.25;
    // Comparative language → moderate reasoning
    if (/比较|对比|区别|差异|优缺点|versus|vs\.?|compared?\sto|differ/i.test(lower))
        score += 0.30;
    // Causal connectives → moderate reasoning
    if (/因为|所以|导致|由于|因此|therefore|because|hence|thus|consequently/i.test(lower))
        score += 0.25;
    // Request patterns (Chinese) — very mild signal
    if (/帮我|请|麻烦/i.test(lower))
        score += 0.05;
    return clamp(score);
}
/**
 * Detect context dependency from pronouns and references.
 */
function scoreContextSignals(lower) {
    var score = 0;
    // Pronoun references to prior content
    if (/这个|那个|它|this|that|these|those|it\s/i.test(lower))
        score += 0.2;
    // "the above" / "上面的" patterns
    if (/上面|上述|前述|上文|aforementioned|the\s+above/i.test(lower))
        score += 0.4;
    return clamp(score);
}
/**
 * Detect creative/writing requests from structural patterns.
 */
function scoreCreativeRequest(lower) {
    var score = 0;
    // Chinese writing requests
    if (/帮我写|写一[篇个首段]|帮我创作|帮我起名/i.test(lower))
        score += 0.40;
    // "关于...的" pattern indicates topical writing
    if (/关于.{2,}的/i.test(lower))
        score += 0.25;
    // English writing requests
    if (/write\s+(a|an|me|the)\b/i.test(lower))
        score += 0.35;
    // Length/word count specification → content creation
    if (/\d+\s*字|字左右|\d+\s*words?/i.test(lower))
        score += 0.20;
    return clamp(score);
}
// ── Length-based scoring ────────────────────────────────────────────────────
/**
 * Map message character count to a 0–1 complexity signal.
 *
 * Piecewise linear:
 *   0–10   chars → 0.00–0.05
 *   10–50  chars → 0.05–0.25
 *   50–150 chars → 0.25–0.50
 *   150–500      → 0.50–0.75
 *   500–2000     → 0.75–0.90
 *   2000+        → 0.90–1.00 (asymptotic)
 */
function scoreLength(message) {
    var len = message.length;
    if (len <= 10)
        return lerp(0, 10, 0.00, 0.05, len);
    if (len <= 50)
        return lerp(10, 50, 0.05, 0.25, len);
    if (len <= 150)
        return lerp(50, 150, 0.25, 0.50, len);
    if (len <= 500)
        return lerp(150, 500, 0.50, 0.75, len);
    if (len <= 2000)
        return lerp(500, 2000, 0.75, 0.90, len);
    return 0.90 + 0.10 * (1 - Math.exp(-(len - 2000) / 3000));
}
// ── Utilities ───────────────────────────────────────────────────────────────
/**
 * Detect if message is in a code/tech context (used to suppress creativity false positives).
 */
function isCodeContext(lower) {
    // 更精确的代码信号检测
    var codePatterns = [
        // 编程语言和技术栈
        /\b(?:python|javascript|typescript|rust|java|golang|sql|css|html|c\+\+|c#|php)\b/,
        // 开发工具和框架
        /\b(?:docker|kubernetes|react|vue|node|npm|pip|git)\b/,
        // 代码相关操作
        /\b(?:脚本|代码|函数|程序|接口|数据库|爬虫|算法|组件|模块|部署|编译|调试|debug|排序|搜索|重构|优化|并发|异步)\b/,
        // 代码语法特征
        /```[\s\S]*?```/, // 代码块
        /import\s+.*?from|def\s+\w+|class\s+\w+|const\s+\w+|let\s+\w+|var\s+\w+/,
        // 文件格式
        /\.(?:py|js|ts|jsx|tsx|java|go|sql|css|html|json|yaml|xml)$/
    ];
    return codePatterns.some(function (pattern) { return pattern.test(lower); });
}
/**
 * Check if message has signals of genuine complexity (multi-step, multi-requirement, etc.).
 * Used to distinguish "write a simple script" from "build a complete system".
 */
function hasComplexitySignals(lower) {
    var complexityPatterns = [
        // 系统级需求
        /\b(?:系统|架构|方案|策略|高可用|高并发|分布式|微服务|迁移|回滚|重构)\b/,
        // 多需求模式
        /包括.*?、.*?、|要求.*?、.*?、|需要.*?和.*?和/,
        // 完整项目需求
        /\b(?:完整|全面|整个|从零开始|从无到有)\b/,
        // 复杂流程
        /首先.*?然后.*?接着.*?最后/
    ];
    return complexityPatterns.some(function (pattern) { return pattern.test(lower); });
}
function lerp(x0, x1, y0, y1, x) {
    return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
}
function clamp(v, min, max) {
    if (min === void 0) { min = 0; }
    if (max === void 0) { max = 1; }
    return Math.max(min, Math.min(max, v));
}
