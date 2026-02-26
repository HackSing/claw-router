"use strict";
/**
 * @aiwaretop/claw-router — Routing Engine
 *
 * Orchestrates: overrides → scorer → sigmoid calibration → tier mapping → model selection.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.route = route;
exports.scoreOnly = scoreOnly;
var types_1 = require("./types");
var overrides_1 = require("./overrides");
var scorer_1 = require("./scorer");
// ── Public API ──────────────────────────────────────────────────────────────
/**
 * Route a message: determine tier and model.
 *
 * @param message  Raw user message
 * @param config   Resolved plugin config
 * @returns        RouteDecision (tier, model, score breakdown, latency)
 */
function route(message, config) {
    var t0 = performance.now();
    // 1. Hard-rule overrides
    var override = (0, overrides_1.checkOverrides)(message);
    if (override) {
        var score_1 = buildOverrideScore(override.tier, override.rule);
        return finalize(score_1, config, t0);
    }
    // 2. 8-dimension scoring
    var dimensions = (0, scorer_1.scoreDimensions)(message, config.weights);
    var rawSum = dimensions.reduce(function (s, d) { return s + d.weighted; }, 0);
    // 3. Calibration (stretches raw sum range into 0–1 for tier mapping)
    var calibrated = calibrate(rawSum);
    // 4. Map score → tier
    var tier = scoreToTier(calibrated, config.thresholds);
    var score = { dimensions: dimensions, rawSum: rawSum, calibrated: calibrated, tier: tier };
    return finalize(score, config, t0);
}
/**
 * Convenience: score only (no model resolution). Useful for testing/debugging.
 */
function scoreOnly(message, config) {
    var override = (0, overrides_1.checkOverrides)(message);
    if (override)
        return buildOverrideScore(override.tier, override.rule);
    var dimensions = (0, scorer_1.scoreDimensions)(message, config.weights);
    var rawSum = dimensions.reduce(function (s, d) { return s + d.weighted; }, 0);
    var calibrated = calibrate(rawSum);
    var tier = scoreToTier(calibrated, config.thresholds);
    return { dimensions: dimensions, rawSum: rawSum, calibrated: calibrated, tier: tier };
}
// ── Internals ───────────────────────────────────────────────────────────────
/**
 * Calibration function: stretches the raw weighted sum into a full 0–1 range.
 *
 * The raw weighted sum typically falls in [0, ~0.45] because:
 *   - Each dimension score is 0–1, multiplied by weight (sum of weights = 1)
 *   - Few messages max out every dimension simultaneously
 *
 * We use a power-curve calibration that maps the effective range [0, 0.50]
 * into [0, 1.0], providing good tier separation.
 */
function calibrate(x) {
    // Linear stretch so 0.50 → 1.0, then power 0.75 for S-curve
    var stretched = Math.min(x / 0.50, 1.0);
    return Math.pow(stretched, 0.75);
}
/** Map calibrated score to a tier using configured thresholds. */
function scoreToTier(score, thresholds) {
    if (thresholds === void 0) { thresholds = types_1.DEFAULT_THRESHOLDS; }
    if (score < thresholds[0])
        return types_1.Tier.TRIVIAL;
    if (score < thresholds[1])
        return types_1.Tier.SIMPLE;
    if (score < thresholds[2])
        return types_1.Tier.MODERATE;
    if (score < thresholds[3])
        return types_1.Tier.COMPLEX;
    return types_1.Tier.EXPERT;
}
/** Build a synthetic ScoreResult for override rules (no real scoring). */
function buildOverrideScore(tier, rule) {
    var dimensions = Object.values(types_1.Dimension).map(function (dim) { return ({
        dimension: dim,
        raw: 0,
        weight: types_1.DEFAULT_WEIGHTS[dim],
        weighted: 0,
    }); });
    return {
        dimensions: dimensions,
        rawSum: 0,
        calibrated: 0,
        tier: tier,
        overrideApplied: rule,
    };
}
/** Resolve model from tier config and build final RouteDecision. */
function finalize(score, config, t0) {
    var tierConf = config.tiers[score.tier];
    return {
        tier: score.tier,
        model: tierConf.primary,
        fallback: tierConf.fallback,
        score: score,
        latencyMs: parseFloat((performance.now() - t0).toFixed(3)),
    };
}
