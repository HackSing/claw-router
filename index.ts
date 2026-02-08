/**
 * @aiwaretop/claw-router — OpenClaw Plugin Entry Point
 *
 * Registers:
 *   • Agent tool:     smart_route
 *   • Auto-reply cmd: /route
 *   • CLI commands:   openclaw route status, openclaw route test "msg"
 *   • Gateway RPC:    route.decide, route.stats
 */

import { route, scoreOnly } from './src/router/engine';
import { resolveConfig, type ResolvedConfig } from './src/config';
import { logDecision } from './src/logger';
import { Tier, type RouterConfig, type RouterStats, type RouteDecision } from './src/router/types';

// ── Runtime state ───────────────────────────────────────────────────────────

let config: ResolvedConfig;
const stats: RouterStats = {
  totalRouted: 0,
  tierCounts: {
    [Tier.TRIVIAL]: 0,
    [Tier.SIMPLE]: 0,
    [Tier.MODERATE]: 0,
    [Tier.COMPLEX]: 0,
    [Tier.EXPERT]: 0,
  },
  avgLatencyMs: 0,
  overrideCount: 0,
};

function trackDecision(d: RouteDecision) {
  stats.totalRouted++;
  stats.tierCounts[d.tier]++;
  if (d.score.overrideApplied) stats.overrideCount++;
  // running average
  stats.avgLatencyMs =
    stats.avgLatencyMs + (d.latencyMs - stats.avgLatencyMs) / stats.totalRouted;
}

// ── Plugin export ───────────────────────────────────────────────────────────

export default {
  id: 'claw-router',
  name: 'Claw Router — Smart Model Routing',

  configSchema: {
    type: 'object' as const,
    properties: {
      tiers: {
        type: 'object' as const,
        description: 'Per-tier model mapping. Keys: TRIVIAL, SIMPLE, MODERATE, COMPLEX, EXPERT',
      },
      thresholds: {
        type: 'array' as const,
        description: 'Four score boundaries [trivial→simple, simple→moderate, moderate→complex, complex→expert]',
        items: { type: 'number' as const },
        minItems: 4,
        maxItems: 4,
      },
      scoring: {
        type: 'object' as const,
        properties: {
          weights: {
            type: 'object' as const,
            description: 'Override dimension weights (keys: reasoning, codeTech, taskSteps, domainExpert, outputComplex, creativity, contextDepend, messageLength)',
          },
        },
      },
      logging: {
        type: 'boolean' as const,
        description: 'Enable verbose routing logs',
        default: false,
      },
    },
  },

  register(api: any) {
    // Resolve config from plugin settings
    const rawConfig: RouterConfig | undefined = api.config;
    config = resolveConfig(rawConfig);

    // ── Agent Tool: smart_route ───────────────────────────────────────────
    api.addTool?.({
      name: 'smart_route',
      description:
        'Analyze a user message and recommend the optimal model tier. ' +
        'Returns tier, model, confidence score, and full dimension breakdown. ' +
        'Use this to decide which model to forward a request to.',
      parameters: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: 'The user message to analyze',
          },
        },
        required: ['message'],
      },
      execute: async (params: { message: string }) => {
        const decision = route(params.message, config);
        trackDecision(decision);
        logDecision(decision, config.logging);
        return {
          tier: decision.tier,
          model: decision.model,
          fallback: decision.fallback,
          score: decision.score.calibrated,
          override: decision.score.overrideApplied ?? null,
          latencyMs: decision.latencyMs,
          dimensions: Object.fromEntries(
            decision.score.dimensions.map(d => [d.dimension, parseFloat(d.raw.toFixed(4))]),
          ),
        };
      },
    });

    // ── Auto-reply Command: /route ────────────────────────────────────────
    api.addCommand?.({
      name: 'route',
      description: 'Show claw-router status and stats',
      execute: async () => {
        const tierLines = Object.entries(config.tiers)
          .map(([t, c]) => `  ${t.padEnd(10)} → ${c.primary}`)
          .join('\n');

        return (
          `🔀 **Claw Router Status**\n\n` +
          `**Tier → Model Mapping:**\n${tierLines}\n\n` +
          `**Stats:**\n` +
          `  Total routed:  ${stats.totalRouted}\n` +
          `  Avg latency:   ${stats.avgLatencyMs.toFixed(2)} ms\n` +
          `  Overrides:     ${stats.overrideCount}\n\n` +
          `**Tier Distribution:**\n` +
          Object.entries(stats.tierCounts)
            .map(([t, c]) => `  ${t.padEnd(10)} ${c}`)
            .join('\n')
        );
      },
    });

    // ── CLI Commands ──────────────────────────────────────────────────────
    api.addCLI?.({
      command: 'route',
      description: 'Smart model router utilities',
      subcommands: {
        status: {
          description: 'Show router configuration and stats',
          execute: async () => {
            console.log('Claw Router — Status');
            console.log('─'.repeat(40));
            console.log('Thresholds:', config.thresholds.join(', '));
            console.log('Logging:', config.logging);
            console.log('\nTier Mapping:');
            for (const [t, c] of Object.entries(config.tiers)) {
              console.log(`  ${t.padEnd(10)} → ${c.primary}`);
            }
            console.log('\nStats:');
            console.log(`  Total:      ${stats.totalRouted}`);
            console.log(`  Avg ms:     ${stats.avgLatencyMs.toFixed(2)}`);
            console.log(`  Overrides:  ${stats.overrideCount}`);
          },
        },
        test: {
          description: 'Test route a message',
          args: [{ name: 'message', description: 'Message to route', required: true }],
          execute: async (args: { message: string }) => {
            const decision = route(args.message, config);
            console.log(`Message:  "${args.message}"`);
            console.log(`Tier:     ${decision.tier}`);
            console.log(`Model:    ${decision.model}`);
            console.log(`Score:    ${decision.score.calibrated.toFixed(4)}`);
            if (decision.score.overrideApplied) {
              console.log(`Override: ${decision.score.overrideApplied}`);
            }
            console.log(`Latency:  ${decision.latencyMs} ms`);
            console.log('\nDimensions:');
            for (const d of decision.score.dimensions) {
              if (d.raw > 0) {
                console.log(`  ${d.dimension.padEnd(16)} ${d.raw.toFixed(4)} × ${d.weight} = ${d.weighted.toFixed(4)}`);
              }
            }
          },
        },
      },
    });

    // ── Gateway RPC ───────────────────────────────────────────────────────
    api.addRPC?.({
      'route.decide': async (params: { message: string }) => {
        const decision = route(params.message, config);
        trackDecision(decision);
        logDecision(decision, config.logging);
        return decision;
      },
      'route.stats': async () => stats,
    });
  },
};
