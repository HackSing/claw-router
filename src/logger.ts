/**
 * @aiwaretop/claw-router — Routing Decision Logger
 *
 * Lightweight logger that formats routing decisions for debugging.
 * Respects the `logging` flag in config.
 */

import type { RouteDecision } from './router/types';

export function logDecision(decision: RouteDecision, logging: boolean): void {
  if (!logging) return;

  const { tier, model, score, latencyMs } = decision;
  const dims = score.dimensions
    .filter(d => d.raw > 0)
    .map(d => `  ${d.dimension}: ${d.raw.toFixed(3)} × ${d.weight} = ${d.weighted.toFixed(4)}`)
    .join('\n');

  const override = score.overrideApplied
    ? `  ⚡ Override: ${score.overrideApplied}\n`
    : '';

  console.log(
    `[claw-router] ─── Route Decision ───\n` +
    `  Tier:       ${tier}\n` +
    `  Model:      ${model}\n` +
    `  Score:      ${score.calibrated.toFixed(4)} (raw sum: ${score.rawSum.toFixed(4)})\n` +
    override +
    (dims ? `  Dimensions:\n${dims}\n` : '') +
    `  Latency:    ${latencyMs} ms\n` +
    `────────────────────────────────────`
  );
}
