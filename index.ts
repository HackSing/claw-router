/**
 * @aiwaretop/claw-router — OpenClaw Plugin Entry Point
 *
 * Automatic model routing based on message complexity.
 *
 * Registers:
 *   • Hook:           before_agent_start — auto-switch model per message
 *   • Agent tool:     smart_route — manual routing query
 *   • Auto-reply cmd: /route — show status and stats
 *   • CLI commands:   openclaw route status / test
 *   • Gateway RPC:    route.decide, route.stats
 */

import { route } from './src/router/engine';
import { resolveConfig, type ResolvedConfig } from './src/config';
import { logDecision } from './src/logger';
import { Tier, type RouterConfig, type RouterStats, type RouteDecision } from './src/router/types';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ── Runtime state ───────────────────────────────────────────────────────────

let pluginConfig: ResolvedConfig;

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
  stats.avgLatencyMs =
    stats.avgLatencyMs + (d.latencyMs - stats.avgLatencyMs) / stats.totalRouted;
}

/**
 * Parse "provider/model" string into { provider, model }.
 */
function parseModelRef(ref: string): { provider: string; model: string } {
  const idx = ref.indexOf('/');
  if (idx === -1) return { provider: '', model: ref };
  return { provider: ref.slice(0, idx), model: ref.slice(idx + 1) };
}

/**
 * Parse agentId from sessionKey.
 * sessionKey format: "agent:<agentId>:<sessionId>"
 */
function parseAgentId(sessionKey: string): string {
  const parts = sessionKey.split(':');
  if (parts.length >= 2 && parts[0] === 'agent') {
    return parts[1];
  }
  return 'main';
}

/**
 * Directly update session store to set model override.
 * Reads/writes ~/.openclaw/agents/<agentId>/sessions/sessions.json.
 */
function applyModelToSession(
  sessionKey: string,
  modelRef: string,
  log: { info: (m: string) => void; warn?: (m: string) => void },
): boolean {
  try {
    const agentId = parseAgentId(sessionKey);
    const storePath = path.join(
      process.env.HOME || '/home/ubuntu',
      '.openclaw', 'agents', agentId, 'sessions', 'sessions.json',
    );

    if (!fs.existsSync(storePath)) {
      log.warn?.(`[claw-router] Session store not found: ${storePath}`);
      return false;
    }

    const raw = fs.readFileSync(storePath, 'utf-8');
    const store = JSON.parse(raw);
    const entry = store[sessionKey];

    if (!entry) {
      log.warn?.(`[claw-router] Session not found: ${sessionKey}`);
      return false;
    }

    const { provider, model } = parseModelRef(modelRef);
    if (!provider || !model) return false;

    // Check if already set to the desired model
    if (entry.modelOverride === model && entry.providerOverride === provider) {
      return false; // no change needed
    }

    entry.modelOverride = model;
    entry.providerOverride = provider;
    entry.updatedAt = Date.now();

    fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
    return true;
  } catch (err) {
    log.warn?.(`[claw-router] Failed to apply model override: ${err}`);
    return false;
  }
}

// ── Plugin export ───────────────────────────────────────────────────────────

const clawRouterPlugin = {
  id: 'claw-router',
  name: 'Claw Router — Smart Model Routing',

  register(api: any) {
    const rawConfig = api.pluginConfig as RouterConfig | undefined;
    pluginConfig = resolveConfig(rawConfig);

    const log = api.logger;
    log.info(`Claw Router loaded. Tiers configured.`);

    // ══════════════════════════════════════════════════════════════════════
    // CORE: before_agent_start hook — automatic model switching
    // ══════════════════════════════════════════════════════════════════════
    api.on('before_agent_start', async (
      event: { prompt: string; messages?: unknown[] },
      ctx: { sessionKey?: string; agentId?: string },
    ) => {
      const userMessage = event.prompt ?? '';
      if (!userMessage.trim()) return;

      // Skip if all tiers point to 'default' (not configured)
      const allDefault = Object.values(pluginConfig.tiers).every((t: any) => t.primary === 'default');
      if (allDefault) return;

      // Run the router
      const decision = route(userMessage, pluginConfig);
      trackDecision(decision);
      logDecision(decision, pluginConfig.logging, log);

      const targetModel = decision.model;
      if (!targetModel || targetModel === 'default') return;

      // Apply model override
      if (ctx.sessionKey) {
        const updated = applyModelToSession(ctx.sessionKey, targetModel, log);
        if (updated) {
          log.info(
            `[claw-router] ${decision.tier} → ${targetModel} ` +
            `(score: ${decision.score.calibrated.toFixed(3)}, ` +
            `latency: ${decision.latencyMs}ms)`
          );
        }
      }

      // Prepend routing context if logging enabled
      if (pluginConfig.logging) {
        return {
          prependContext: `[claw-router: tier=${decision.tier}, model=${targetModel}, score=${decision.score.calibrated.toFixed(3)}]`,
        };
      }
    });

    // ══════════════════════════════════════════════════════════════════════
    // CORE: agent_end hook — log token usage after agent completes
    // ══════════════════════════════════════════════════════════════════════
    api.on('agent_end', async (
      event: {
        messages: unknown[];
        success: boolean;
        error?: string;
        durationMs?: number;
        tokenUsage?: { input: number; output: number; total?: number };
      },
      ctx: { sessionKey?: string; agentId?: string },
    ) => {
      console.log(`[claw-router DEBUG] agent_end hook triggered, tokenUsage:`, event.tokenUsage);
      if (!pluginConfig.logging) {
        console.log(`[claw-router DEBUG] logging disabled, skipping`);
        return;
      }
      if (!event.tokenUsage) {
        console.log(`[claw-router DEBUG] no tokenUsage, skipping`);
        return;
      }

      // Read session store to get actual model used
      let modelDisplay = 'unknown';
      if (ctx.sessionKey) {
        try {
          const agentId = parseAgentId(ctx.sessionKey);
          const storePath = path.join(
            process.env.HOME || '/home/ubuntu',
            '.openclaw', 'agents', agentId, 'sessions', 'sessions.json',
          );
          if (fs.existsSync(storePath)) {
            const raw = fs.readFileSync(storePath, 'utf-8');
            const store = JSON.parse(raw);
            const entry = store[ctx.sessionKey];
            if (entry) {
              const provider = entry.providerOverride || entry.modelProvider || 'unknown';
              const model = entry.modelOverride || entry.model || 'unknown';
              modelDisplay = `${provider}/${model}`;
            }
          }
        } catch (err) {
          console.log(`[claw-router DEBUG] Failed to read model from session: ${err}`);
        }
      }

      const { input, output, total } = event.tokenUsage;
      const msg = `[claw-router] Tokens: ${input} in / ${output} out (total: ${total ?? input + output}, duration: ${event.durationMs ?? 0}ms, model: ${modelDisplay})`;
      console.log(msg);
      log.info(msg);
    });

    // ══════════════════════════════════════════════════════════════════════
    // Agent Tool: smart_route
    // ══════════════════════════════════════════════════════════════════════
    api.registerTool({
      name: 'smart_route',
      description:
        'Analyze a user message and recommend the optimal model tier. ' +
        'Returns tier, model, confidence score, and dimension breakdown.',
      parameters: {
        type: 'object' as const,
        properties: {
          message: {
            type: 'string' as const,
            description: 'The user message to analyze',
          },
        },
        required: ['message'],
      },
      async execute(_id: string, params: { message: string }) {
        const decision = route(params.message, pluginConfig);
        trackDecision(decision);
        logDecision(decision, pluginConfig.logging, log);
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              tier: decision.tier,
              model: decision.model,
              fallback: decision.fallback,
              score: decision.score.calibrated,
              override: decision.score.overrideApplied ?? null,
              latencyMs: decision.latencyMs,
              dimensions: Object.fromEntries(
                decision.score.dimensions.map(d => [d.dimension, parseFloat(d.raw.toFixed(4))]),
              ),
            }, null, 2),
          }],
        };
      },
    });

    // ══════════════════════════════════════════════════════════════════════
    // Auto-reply Command: /route
    // ══════════════════════════════════════════════════════════════════════
    api.registerCommand({
      name: 'route',
      description: 'Show claw-router status, tier mapping, and routing stats',
      acceptsArgs: true,
      handler: (ctx: any) => {
        const tierLines = Object.entries(pluginConfig.tiers)
          .map(([t, c]: [string, any]) => `  ${t.padEnd(10)} → ${c.primary}`)
          .join('\n');

        const statsText =
          `Total routed:  ${stats.totalRouted}\n` +
          `Avg latency:   ${stats.avgLatencyMs.toFixed(2)} ms\n` +
          `Overrides:     ${stats.overrideCount}`;

        const distText = Object.entries(stats.tierCounts)
          .map(([t, c]) => `  ${t.padEnd(10)} ${c}`)
          .join('\n');

        // If args, test-route that message
        if (ctx.args && ctx.args.trim()) {
          const decision = route(ctx.args.trim(), pluginConfig);
          const dims = decision.score.dimensions
            .filter(d => d.raw > 0)
            .map(d => `  ${d.dimension.padEnd(16)} ${d.raw.toFixed(3)}`)
            .join('\n');

          return {
            text:
              `🔀 **Route Test**\n\n` +
              `Message: "${ctx.args.trim()}"\n` +
              `Tier: **${decision.tier}**\n` +
              `Model: ${decision.model}\n` +
              `Score: ${decision.score.calibrated.toFixed(4)}\n` +
              (decision.score.overrideApplied ? `Override: ${decision.score.overrideApplied}\n` : '') +
              (dims ? `\nDimensions:\n${dims}` : ''),
          };
        }

        return {
          text:
            `🔀 **Claw Router Status**\n\n` +
            `**Tier → Model Mapping:**\n${tierLines}\n\n` +
            `**Stats:**\n${statsText}\n\n` +
            `**Tier Distribution:**\n${distText}\n\n` +
            `_Tip: /route <message> to test routing_`,
        };
      },
    });

    // ══════════════════════════════════════════════════════════════════════
    // CLI Commands
    // ══════════════════════════════════════════════════════════════════════
    api.registerCli(({ program }: any) => {
      const routeCmd = program.command('route').description('Smart model router utilities');

      routeCmd.command('status').description('Show router config and stats').action(() => {
        console.log('🔀 Claw Router — Status');
        console.log('─'.repeat(40));
        console.log('Thresholds:', pluginConfig.thresholds.join(', '));
        console.log('Logging:', pluginConfig.logging);
        console.log('\nTier Mapping:');
        for (const [t, c] of Object.entries(pluginConfig.tiers)) {
          console.log(`  ${t.padEnd(10)} → ${c.primary}`);
        }
        console.log('\nStats:');
        console.log(`  Total:      ${stats.totalRouted}`);
        console.log(`  Avg ms:     ${stats.avgLatencyMs.toFixed(2)}`);
        console.log(`  Overrides:  ${stats.overrideCount}`);
      });

      routeCmd.command('test').description('Test-route a message').argument('<message...>').action((...args: any[]) => {
        const words = args[0] as string[];
        const msg = words.join(' ');
        const decision = route(msg, pluginConfig);
        console.log(`Message:  "${msg}"`);
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
      });
    }, { commands: ['route'] });

    // ══════════════════════════════════════════════════════════════════════
    // Gateway RPC
    // ══════════════════════════════════════════════════════════════════════
    api.registerGatewayMethod('route.decide', ({ params, respond }: any) => {
      const { message } = params as { message: string };
      if (!message) {
        respond(false, { error: 'message parameter required' });
        return;
      }
      const decision = route(message, pluginConfig);
      trackDecision(decision);
      logDecision(decision, pluginConfig.logging, log);
      respond(true, decision);
    });

    api.registerGatewayMethod('route.stats', ({ respond }: any) => {
      respond(true, stats);
    });
  },
};

export default clawRouterPlugin;
