/**
 * @aiwaretop/claw-router — OpenClaw Plugin Entry Point
 *
 * Automatic model routing based on trait-based capability matching.
 *
 * Registers:
 *   • Hook:           before_agent_start — auto-switch model per message
 *   • Agent tool:     smart_route — manual routing query
 *   • Auto-reply cmd: /route — show status and stats
 *   • CLI commands:   openclaw route status / test
 *   • Gateway RPC:    route.decide, route.stats
 */

import { route } from './src/router/engine';
import { LlmScorer } from './src/router/llm-scorer';
import { resolveConfig, type ResolvedConfig } from './src/config';
import { logDecision } from './src/logger';
import { Tier, type RouterConfig, type RouterStats, type RouteDecision } from './src/router/types';
import { createStats, trackDecision } from './src/stats';
import { applyModelToSession, parseAgentId } from './src/session';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ── Runtime state ───────────────────────────────────────────────────────────

let pluginConfig: ResolvedConfig;
const stats = createStats();


// ── Plugin export ───────────────────────────────────────────────────────────

const clawRouterPlugin = {
  id: 'claw-router',
  name: 'Claw Router — Smart Model Routing',

  register(api: any) {
    const rawConfig = api.pluginConfig as RouterConfig | undefined;
    pluginConfig = resolveConfig(rawConfig);

    // Initialize LLM scorer if enabled
    if (pluginConfig.llmScoring?.enabled) {
      const llmConfig = pluginConfig.llmScoring;

      const model = llmConfig.model || 'deepseek-ai/DeepSeek-V3-Chat';

      // Require user to configure apiKey and baseUrl
      if (!llmConfig.apiKey || !llmConfig.baseUrl) {
        api.logger.warn('[claw-router] LLM scoring requires apiKey and baseUrl in llmScoring config. LLM scoring disabled.');
      } else {
        // 创建 LLM 调用函数（带 3s 超时保护）
        const invokeLLM = async (modelName: string, prompt: string): Promise<string> => {
          const { apiKey, baseUrl, apiPath } = detectProviderFromModel(modelName, llmConfig);

          // 保留完整模型路径，但去掉 "siliconflow/" 前缀
          let actualModel = modelName;
          if (modelName.startsWith('siliconflow/')) {
            actualModel = modelName.substring('siliconflow/'.length);
          }

          console.log(`[claw-router] LLM API 调用: model=${actualModel}`);

          // 3 秒超时保护
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 3000);

          try {
            const response = await fetch(`${baseUrl}${apiPath}`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                model: actualModel,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.1,
                max_tokens: 256
              }),
              signal: controller.signal,
            });

            if (!response.ok) {
              const errorText = await response.text();
              throw new Error(`LLM API 错误: ${response.status} - ${errorText}`);
            }

            const data = await response.json();
            return data.choices?.[0]?.message?.content || '';
          } finally {
            clearTimeout(timeout);
          }
        };

        pluginConfig.llmScorerInstance = new LlmScorer(llmConfig, invokeLLM);
        api.logger.info(`[claw-router] LLM 评分已启用: model=${model}`);
      }
    }

    // Helper: detect provider config from model name
    function detectProviderFromModel(modelName: string, config: any): { apiKey: string; baseUrl: string; apiPath: string } {
      if (!config.apiKey || !config.baseUrl) {
        throw new Error(`[claw-router] LLM scoring requires apiKey and baseUrl in llmScoring config.`);
      }

      return {
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        apiPath: config.apiPath || '/v1/chat/completions'
      };
    }

    const log = api.logger;

    // 日志：显示已注册的模型数量
    const userModels = pluginConfig.models.filter(m => m.id !== 'default');
    log.info(`Claw Router loaded. ${userModels.length} model(s) configured.`);

    // ══════════════════════════════════════════════════════════════════════
    // CORE: before_agent_start hook — automatic model switching
    // ══════════════════════════════════════════════════════════════════════
    api.on('before_agent_start', async (
      event: { prompt: string; messages?: unknown[] },
      ctx: { sessionKey?: string; agentId?: string },
    ) => {
      const userMessage = event.prompt ?? '';
      if (!userMessage.trim()) return;

      // 如果只有 default 模型（用户没配 models），跳过路由
      const hasUserModels = pluginConfig.models.some(m => m.id !== 'default');
      if (!hasUserModels) return;

      // Run the router
      const decision = await route(userMessage, pluginConfig);
      trackDecision(stats, decision);
      logDecision(decision, pluginConfig.logging, log);

      const targetModel = decision.model;
      if (!targetModel || targetModel === 'default') return;

      // Apply model override
      if (ctx.sessionKey) {
        const updated = applyModelToSession(ctx.sessionKey, targetModel, log);
        if (updated) {
          log.info(
            `[claw-router] ${decision.tier}/${decision.taskType} → ${targetModel} ` +
            `(match: ${decision.matchSource}, score: ${decision.score.calibrated.toFixed(3)}, ` +
            `latency: ${decision.latencyMs}ms)`
          );
        }
      }

      // Prepend routing context if logging enabled
      if (pluginConfig.logging) {
        return {
          prependContext: `[claw-router: tier=${decision.tier}, taskType=${decision.taskType}, model=${targetModel}, match=${decision.matchSource}, score=${decision.score.calibrated.toFixed(3)}]`,
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
      if (!pluginConfig.logging) return;
      if (!event.tokenUsage) return;

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
        } catch (_err) {
          // 读取失败时静默降级
        }
      }

      const { input, output, total } = event.tokenUsage;
      const msg = `[claw-router] Tokens: ${input} in / ${output} out (total: ${total ?? input + output}, duration: ${event.durationMs ?? 0}ms, model: ${modelDisplay})`;
      log.info(msg);
    });

    // ══════════════════════════════════════════════════════════════════════
    // Agent Tool: smart_route
    // ══════════════════════════════════════════════════════════════════════
    api.registerTool({
      name: 'smart_route',
      description:
        'Analyze a user message and recommend the optimal model based on trait matching. ' +
        'Returns tier, taskType, model, match source, and dimension breakdown.',
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
        const decision = await route(params.message, pluginConfig);
        trackDecision(stats, decision);
        logDecision(decision, pluginConfig.logging, log);
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              tier: decision.tier,
              taskType: decision.taskType,
              model: decision.model,
              matchSource: decision.matchSource,
              score: decision.score.calibrated,
              override: decision.score.overrideApplied ?? null,
              latencyMs: decision.latencyMs,
              candidates: decision.candidates.map(c => ({
                model: c.model.id,
                score: c.score,
                matchedTraits: c.matchedTraits,
              })),
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
      description: 'Show claw-router status, model profiles, and routing stats',
      acceptsArgs: true,
      handler: async (ctx: any) => {
        const modelLines = pluginConfig.models
          .map(m => `  ${m.id.padEnd(30)} [${m.traits.join(', ')}]`)
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
          const decision = await route(ctx.args.trim(), pluginConfig);
          const dims = decision.score.dimensions
            .filter(d => d.raw > 0)
            .map(d => `  ${d.dimension.padEnd(16)} ${d.raw.toFixed(3)}`)
            .join('\n');

          const candidateText = decision.candidates
            .map(c => `  ${c.model.id}: ${(c.score * 100).toFixed(0)}% [${c.matchedTraits.join(', ')}]`)
            .join('\n');

          return {
            text:
              `🔀 **Route Test**\n\n` +
              `Message: "${ctx.args.trim()}"\n` +
              `Tier: **${decision.tier}**\n` +
              `TaskType: **${decision.taskType}**\n` +
              `Model: ${decision.model}\n` +
              `Match: ${decision.matchSource}\n` +
              `Score: ${decision.score.calibrated.toFixed(4)}\n` +
              (decision.score.overrideApplied ? `Override: ${decision.score.overrideApplied}\n` : '') +
              (candidateText ? `\nCandidates:\n${candidateText}` : '') +
              (dims ? `\nDimensions:\n${dims}` : ''),
          };
        }

        return {
          text:
            `🔀 **Claw Router Status**\n\n` +
            `**Model Profiles:**\n${modelLines}\n\n` +
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
        console.log('\nModel Profiles:');
        for (const m of pluginConfig.models) {
          console.log(`  ${m.id.padEnd(30)} [${m.traits.join(', ')}]`);
        }
        console.log('\nStats:');
        console.log(`  Total:      ${stats.totalRouted}`);
        console.log(`  Avg ms:     ${stats.avgLatencyMs.toFixed(2)}`);
        console.log(`  Overrides:  ${stats.overrideCount}`);
      });

      routeCmd.command('test').description('Test-route a message').argument('<message...>').action(async (...args: any[]) => {
        const words = args[0] as string[];
        const msg = words.join(' ');
        const decision = await route(msg, pluginConfig);
        console.log(`Message:     "${msg}"`);
        console.log(`Tier:        ${decision.tier}`);
        console.log(`TaskType:    ${decision.taskType}`);
        console.log(`Model:       ${decision.model}`);
        console.log(`Match:       ${decision.matchSource}`);
        console.log(`Score:       ${decision.score.calibrated.toFixed(4)}`);
        if (decision.score.overrideApplied) {
          console.log(`Override:    ${decision.score.overrideApplied}`);
        }
        console.log(`Latency:     ${decision.latencyMs} ms`);

        if (decision.candidates.length > 0) {
          console.log('\nCandidates:');
          for (const c of decision.candidates) {
            console.log(`  ${c.model.id}: ${(c.score * 100).toFixed(0)}% match [${c.matchedTraits.join(', ')}]`);
          }
        }

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
    api.registerGatewayMethod('route.decide', async ({ params, respond }: any) => {
      const { message } = params as { message: string };
      if (!message) {
        respond(false, { error: 'message parameter required' });
        return;
      }
      const decision = await route(message, pluginConfig);
      trackDecision(stats, decision);
      logDecision(decision, pluginConfig.logging, log);
      respond(true, decision);
    });

    api.registerGatewayMethod('route.stats', ({ respond }: any) => {
      respond(true, stats);
    });
  },
};

export default clawRouterPlugin;
