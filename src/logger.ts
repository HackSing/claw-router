/**
 * @aiwaretop/claw-router — Routing Decision Logger
 *
 * Lightweight logger that formats routing decisions for debugging.
 * Respects the `logging` flag in config.
 */

import type { RouteDecision } from './router/types';

interface Logger {
  info: (msg: string) => void;
}

export function logDecision(decision: RouteDecision, logging: boolean, logger?: Logger): void {
  if (!logging) return;

  const { tier, model, score, latencyMs } = decision;
  const dims = score.dimensions
    .filter(d => d.raw > 0)
    .map(d => `  ${d.dimension}: ${d.raw.toFixed(3)} × ${d.weight} = ${d.weighted.toFixed(4)}`)
    .join('\n');

  const override = score.overrideApplied
    ? `  ⚡ Override: ${score.overrideApplied}\n`
    : '';

  const message =
    `[claw-router] ─── Route Decision ───\n` +
    `  Tier:       ${tier}\n` +
    `  Model:      ${model}\n` +
    `  Score:      ${score.calibrated.toFixed(4)} (raw sum: ${score.rawSum.toFixed(4)})\n` +
    override +
    (dims ? `  Dimensions:\n${dims}\n` : '') +
    `  Latency:    ${latencyMs} ms\n` +
    `────────────────────────────────────`;

  // Use provided logger or fall back to console
  // Use console.log to ensure visibility in OpenClaw logs
  console.log(message);
}
