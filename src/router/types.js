"use strict";
/**
 * @aiwaretop/claw-router — Type Definitions
 *
 * Core types for the 8-dimension scoring engine and tier routing system.
 */
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_THRESHOLDS = exports.DEFAULT_WEIGHTS = exports.Dimension = exports.TIER_ORDER = exports.Tier = void 0;
// ── Tier ────────────────────────────────────────────────────────────────────
/** The five complexity tiers, ordered from simplest to hardest. */
var Tier;
(function (Tier) {
    Tier["TRIVIAL"] = "TRIVIAL";
    Tier["SIMPLE"] = "SIMPLE";
    Tier["MODERATE"] = "MODERATE";
    Tier["COMPLEX"] = "COMPLEX";
    Tier["EXPERT"] = "EXPERT";
})(Tier || (exports.Tier = Tier = {}));
/** Ordered array for threshold-based lookups. */
exports.TIER_ORDER = [
    Tier.TRIVIAL,
    Tier.SIMPLE,
    Tier.MODERATE,
    Tier.COMPLEX,
    Tier.EXPERT,
];
// ── Scoring Dimensions ──────────────────────────────────────────────────────
/** The eight scoring dimensions. */
var Dimension;
(function (Dimension) {
    Dimension["REASONING"] = "reasoning";
    Dimension["CODE_TECH"] = "codeTech";
    Dimension["TASK_STEPS"] = "taskSteps";
    Dimension["DOMAIN_EXPERT"] = "domainExpert";
    Dimension["OUTPUT_COMPLEX"] = "outputComplex";
    Dimension["CREATIVITY"] = "creativity";
    Dimension["CONTEXT_DEPEND"] = "contextDepend";
    Dimension["MESSAGE_LENGTH"] = "messageLength";
})(Dimension || (exports.Dimension = Dimension = {}));
/** Default weights for each dimension (sum = 1.0). */
exports.DEFAULT_WEIGHTS = (_a = {},
    _a[Dimension.REASONING] = 0.20,
    _a[Dimension.CODE_TECH] = 0.18,
    _a[Dimension.TASK_STEPS] = 0.15,
    _a[Dimension.DOMAIN_EXPERT] = 0.12,
    _a[Dimension.OUTPUT_COMPLEX] = 0.10,
    _a[Dimension.CREATIVITY] = 0.10,
    _a[Dimension.CONTEXT_DEPEND] = 0.08,
    _a[Dimension.MESSAGE_LENGTH] = 0.07,
    _a);
/** Default tier thresholds: [TRIVIAL→SIMPLE, SIMPLE→MODERATE, MODERATE→COMPLEX, COMPLEX→EXPERT] */
exports.DEFAULT_THRESHOLDS = [0.15, 0.40, 0.55, 0.75];
