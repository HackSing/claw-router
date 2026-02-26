"use strict";
/**
 * @aiwaretop/claw-router — Routing Decision Logger
 *
 * Lightweight logger that formats routing decisions for debugging.
 * Respects the `logging` flag in config.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.logDecision = logDecision;
function logDecision(decision, logging, logger) {
    if (!logging)
        return;
    var tier = decision.tier, model = decision.model, score = decision.score, latencyMs = decision.latencyMs;
    var dims = score.dimensions
        .filter(function (d) { return d.raw > 0; })
        .map(function (d) { return "  ".concat(d.dimension, ": ").concat(d.raw.toFixed(3), " \u00D7 ").concat(d.weight, " = ").concat(d.weighted.toFixed(4)); })
        .join('\n');
    var override = score.overrideApplied
        ? "  \u26A1 Override: ".concat(score.overrideApplied, "\n")
        : '';
    var message = "[claw-router] \u2500\u2500\u2500 Route Decision \u2500\u2500\u2500\n" +
        "  Tier:       ".concat(tier, "\n") +
        "  Model:      ".concat(model, "\n") +
        "  Score:      ".concat(score.calibrated.toFixed(4), " (raw sum: ").concat(score.rawSum.toFixed(4), ")\n") +
        override +
        (dims ? "  Dimensions:\n".concat(dims, "\n") : '') +
        "  Latency:    ".concat(latencyMs, " ms\n") +
        "\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500";
    // Use provided logger or fall back to console
    // Use console.log to ensure visibility in OpenClaw logs
    console.log(message);
}
