"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
var engine_1 = require("./src/router/engine");
var config_1 = require("./src/config");
var logger_1 = require("./src/logger");
var types_1 = require("./src/router/types");
var fs = __importStar(require("node:fs"));
var path = __importStar(require("node:path"));
// ── Runtime state ───────────────────────────────────────────────────────────
var pluginConfig;
var stats = {
    totalRouted: 0,
    tierCounts: (_a = {},
        _a[types_1.Tier.TRIVIAL] = 0,
        _a[types_1.Tier.SIMPLE] = 0,
        _a[types_1.Tier.MODERATE] = 0,
        _a[types_1.Tier.COMPLEX] = 0,
        _a[types_1.Tier.EXPERT] = 0,
        _a),
    avgLatencyMs: 0,
    overrideCount: 0,
};
function trackDecision(d) {
    stats.totalRouted++;
    stats.tierCounts[d.tier]++;
    if (d.score.overrideApplied)
        stats.overrideCount++;
    stats.avgLatencyMs =
        stats.avgLatencyMs + (d.latencyMs - stats.avgLatencyMs) / stats.totalRouted;
}
/**
 * Parse "provider/model" string into { provider, model }.
 */
function parseModelRef(ref) {
    var idx = ref.indexOf('/');
    if (idx === -1)
        return { provider: '', model: ref };
    return { provider: ref.slice(0, idx), model: ref.slice(idx + 1) };
}
/**
 * Parse agentId from sessionKey.
 * sessionKey format: "agent:<agentId>:<sessionId>"
 */
function parseAgentId(sessionKey) {
    var parts = sessionKey.split(':');
    if (parts.length >= 2 && parts[0] === 'agent') {
        return parts[1];
    }
    return 'main';
}
/**
 * Directly update session store to set model override.
 * Reads/writes ~/.openclaw/agents/<agentId>/sessions/sessions.json.
 */
function applyModelToSession(sessionKey, modelRef, log) {
    var _a, _b, _c;
    try {
        var agentId = parseAgentId(sessionKey);
        var storePath = path.join(process.env.HOME || '/home/ubuntu', '.openclaw', 'agents', agentId, 'sessions', 'sessions.json');
        if (!fs.existsSync(storePath)) {
            (_a = log.warn) === null || _a === void 0 ? void 0 : _a.call(log, "[claw-router] Session store not found: ".concat(storePath));
            return false;
        }
        var raw = fs.readFileSync(storePath, 'utf-8');
        var store = JSON.parse(raw);
        var entry = store[sessionKey];
        if (!entry) {
            (_b = log.warn) === null || _b === void 0 ? void 0 : _b.call(log, "[claw-router] Session not found: ".concat(sessionKey));
            return false;
        }
        var _d = parseModelRef(modelRef), provider = _d.provider, model = _d.model;
        if (!provider || !model)
            return false;
        // Check if already set to the desired model
        if (entry.modelOverride === model && entry.providerOverride === provider) {
            return false; // no change needed
        }
        entry.modelOverride = model;
        entry.providerOverride = provider;
        entry.updatedAt = Date.now();
        fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
        return true;
    }
    catch (err) {
        (_c = log.warn) === null || _c === void 0 ? void 0 : _c.call(log, "[claw-router] Failed to apply model override: ".concat(err));
        return false;
    }
}
// ── Plugin export ───────────────────────────────────────────────────────────
var clawRouterPlugin = {
    id: 'claw-router',
    name: 'Claw Router — Smart Model Routing',
    configSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
            tiers: {
                type: 'object',
                description: 'Per-tier model mapping. Keys: TRIVIAL, SIMPLE, MODERATE, COMPLEX, EXPERT',
            },
            thresholds: {
                type: 'array',
                description: 'Four score boundaries [trivial→simple, simple→moderate, moderate→complex, complex→expert]',
                items: { type: 'number' },
                minItems: 4,
                maxItems: 4,
            },
            scoring: {
                type: 'object',
                properties: {
                    weights: {
                        type: 'object',
                        description: 'Override dimension weights',
                    },
                },
            },
            logging: {
                type: 'boolean',
                description: 'Enable verbose routing logs',
                default: false,
            },
        },
    },
    register: function (api) {
        var _this = this;
        var rawConfig = api.pluginConfig;
        pluginConfig = (0, config_1.resolveConfig)(rawConfig);
        var log = api.logger;
        log.info("Claw Router loaded. Tiers configured.");
        // ══════════════════════════════════════════════════════════════════════
        // CORE: before_agent_start hook — automatic model switching
        // ══════════════════════════════════════════════════════════════════════
        api.on('before_agent_start', function (event, ctx) { return __awaiter(_this, void 0, void 0, function () {
            var userMessage, allDefault, decision, targetModel, updated;
            var _a;
            return __generator(this, function (_b) {
                userMessage = (_a = event.prompt) !== null && _a !== void 0 ? _a : '';
                if (!userMessage.trim())
                    return [2 /*return*/];
                allDefault = Object.values(pluginConfig.tiers).every(function (t) { return t.primary === 'default'; });
                if (allDefault)
                    return [2 /*return*/];
                decision = (0, engine_1.route)(userMessage, pluginConfig);
                trackDecision(decision);
                (0, logger_1.logDecision)(decision, pluginConfig.logging, log);
                targetModel = decision.model;
                if (!targetModel || targetModel === 'default')
                    return [2 /*return*/];
                // Apply model override
                if (ctx.sessionKey) {
                    updated = applyModelToSession(ctx.sessionKey, targetModel, log);
                    if (updated) {
                        log.info("[claw-router] ".concat(decision.tier, " \u2192 ").concat(targetModel, " ") +
                            "(score: ".concat(decision.score.calibrated.toFixed(3), ", ") +
                            "latency: ".concat(decision.latencyMs, "ms)"));
                    }
                }
                // Prepend routing context if logging enabled
                if (pluginConfig.logging) {
                    return [2 /*return*/, {
                            prependContext: "[claw-router: tier=".concat(decision.tier, ", model=").concat(targetModel, ", score=").concat(decision.score.calibrated.toFixed(3), "]"),
                        }];
                }
                return [2 /*return*/];
            });
        }); });
        // ══════════════════════════════════════════════════════════════════════
        // CORE: agent_end hook — log token usage after agent completes
        // ══════════════════════════════════════════════════════════════════════
        api.on('agent_end', function (event, ctx) { return __awaiter(_this, void 0, void 0, function () {
            var modelDisplay, agentId, storePath, raw, store, entry, provider, model, _a, input, output, total, msg;
            var _b;
            return __generator(this, function (_c) {
                console.log("[claw-router DEBUG] agent_end hook triggered, tokenUsage:", event.tokenUsage);
                if (!pluginConfig.logging) {
                    console.log("[claw-router DEBUG] logging disabled, skipping");
                    return [2 /*return*/];
                }
                if (!event.tokenUsage) {
                    console.log("[claw-router DEBUG] no tokenUsage, skipping");
                    return [2 /*return*/];
                }
                modelDisplay = 'unknown';
                if (ctx.sessionKey) {
                    try {
                        agentId = parseAgentId(ctx.sessionKey);
                        storePath = path.join(process.env.HOME || '/home/ubuntu', '.openclaw', 'agents', agentId, 'sessions', 'sessions.json');
                        if (fs.existsSync(storePath)) {
                            raw = fs.readFileSync(storePath, 'utf-8');
                            store = JSON.parse(raw);
                            entry = store[ctx.sessionKey];
                            if (entry) {
                                provider = entry.providerOverride || entry.modelProvider || 'unknown';
                                model = entry.modelOverride || entry.model || 'unknown';
                                modelDisplay = "".concat(provider, "/").concat(model);
                            }
                        }
                    }
                    catch (err) {
                        console.log("[claw-router DEBUG] Failed to read model from session: ".concat(err));
                    }
                }
                _a = event.tokenUsage, input = _a.input, output = _a.output, total = _a.total;
                msg = "[claw-router] Tokens: ".concat(input, " in / ").concat(output, " out (total: ").concat(total !== null && total !== void 0 ? total : input + output, ", duration: ").concat((_b = event.durationMs) !== null && _b !== void 0 ? _b : 0, "ms, model: ").concat(modelDisplay, ")");
                console.log(msg);
                log.info(msg);
                return [2 /*return*/];
            });
        }); });
        // ══════════════════════════════════════════════════════════════════════
        // Agent Tool: smart_route
        // ══════════════════════════════════════════════════════════════════════
        api.registerTool({
            name: 'smart_route',
            description: 'Analyze a user message and recommend the optimal model tier. ' +
                'Returns tier, model, confidence score, and dimension breakdown.',
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
            execute: function (_id, params) {
                return __awaiter(this, void 0, void 0, function () {
                    var decision;
                    var _a;
                    return __generator(this, function (_b) {
                        decision = (0, engine_1.route)(params.message, pluginConfig);
                        trackDecision(decision);
                        (0, logger_1.logDecision)(decision, pluginConfig.logging, log);
                        return [2 /*return*/, {
                                content: [{
                                        type: 'text',
                                        text: JSON.stringify({
                                            tier: decision.tier,
                                            model: decision.model,
                                            fallback: decision.fallback,
                                            score: decision.score.calibrated,
                                            override: (_a = decision.score.overrideApplied) !== null && _a !== void 0 ? _a : null,
                                            latencyMs: decision.latencyMs,
                                            dimensions: Object.fromEntries(decision.score.dimensions.map(function (d) { return [d.dimension, parseFloat(d.raw.toFixed(4))]; })),
                                        }, null, 2),
                                    }],
                            }];
                    });
                });
            },
        });
        // ══════════════════════════════════════════════════════════════════════
        // Auto-reply Command: /route
        // ══════════════════════════════════════════════════════════════════════
        api.registerCommand({
            name: 'route',
            description: 'Show claw-router status, tier mapping, and routing stats',
            acceptsArgs: true,
            handler: function (ctx) {
                var tierLines = Object.entries(pluginConfig.tiers)
                    .map(function (_a) {
                    var t = _a[0], c = _a[1];
                    return "  ".concat(t.padEnd(10), " \u2192 ").concat(c.primary);
                })
                    .join('\n');
                var statsText = "Total routed:  ".concat(stats.totalRouted, "\n") +
                    "Avg latency:   ".concat(stats.avgLatencyMs.toFixed(2), " ms\n") +
                    "Overrides:     ".concat(stats.overrideCount);
                var distText = Object.entries(stats.tierCounts)
                    .map(function (_a) {
                    var t = _a[0], c = _a[1];
                    return "  ".concat(t.padEnd(10), " ").concat(c);
                })
                    .join('\n');
                // If args, test-route that message
                if (ctx.args && ctx.args.trim()) {
                    var decision = (0, engine_1.route)(ctx.args.trim(), pluginConfig);
                    var dims = decision.score.dimensions
                        .filter(function (d) { return d.raw > 0; })
                        .map(function (d) { return "  ".concat(d.dimension.padEnd(16), " ").concat(d.raw.toFixed(3)); })
                        .join('\n');
                    return {
                        text: "\uD83D\uDD00 **Route Test**\n\n" +
                            "Message: \"".concat(ctx.args.trim(), "\"\n") +
                            "Tier: **".concat(decision.tier, "**\n") +
                            "Model: ".concat(decision.model, "\n") +
                            "Score: ".concat(decision.score.calibrated.toFixed(4), "\n") +
                            (decision.score.overrideApplied ? "Override: ".concat(decision.score.overrideApplied, "\n") : '') +
                            (dims ? "\nDimensions:\n".concat(dims) : ''),
                    };
                }
                return {
                    text: "\uD83D\uDD00 **Claw Router Status**\n\n" +
                        "**Tier \u2192 Model Mapping:**\n".concat(tierLines, "\n\n") +
                        "**Stats:**\n".concat(statsText, "\n\n") +
                        "**Tier Distribution:**\n".concat(distText, "\n\n") +
                        "_Tip: /route <message> to test routing_",
                };
            },
        });
        // ══════════════════════════════════════════════════════════════════════
        // CLI Commands
        // ══════════════════════════════════════════════════════════════════════
        api.registerCli(function (_a) {
            var program = _a.program;
            var routeCmd = program.command('route').description('Smart model router utilities');
            routeCmd.command('status').description('Show router config and stats').action(function () {
                console.log('🔀 Claw Router — Status');
                console.log('─'.repeat(40));
                console.log('Thresholds:', pluginConfig.thresholds.join(', '));
                console.log('Logging:', pluginConfig.logging);
                console.log('\nTier Mapping:');
                for (var _i = 0, _a = Object.entries(pluginConfig.tiers); _i < _a.length; _i++) {
                    var _b = _a[_i], t = _b[0], c = _b[1];
                    console.log("  ".concat(t.padEnd(10), " \u2192 ").concat(c.primary));
                }
                console.log('\nStats:');
                console.log("  Total:      ".concat(stats.totalRouted));
                console.log("  Avg ms:     ".concat(stats.avgLatencyMs.toFixed(2)));
                console.log("  Overrides:  ".concat(stats.overrideCount));
            });
            routeCmd.command('test').description('Test-route a message').argument('<message...>').action(function () {
                var args = [];
                for (var _i = 0; _i < arguments.length; _i++) {
                    args[_i] = arguments[_i];
                }
                var words = args[0];
                var msg = words.join(' ');
                var decision = (0, engine_1.route)(msg, pluginConfig);
                console.log("Message:  \"".concat(msg, "\""));
                console.log("Tier:     ".concat(decision.tier));
                console.log("Model:    ".concat(decision.model));
                console.log("Score:    ".concat(decision.score.calibrated.toFixed(4)));
                if (decision.score.overrideApplied) {
                    console.log("Override: ".concat(decision.score.overrideApplied));
                }
                console.log("Latency:  ".concat(decision.latencyMs, " ms"));
                console.log('\nDimensions:');
                for (var _a = 0, _b = decision.score.dimensions; _a < _b.length; _a++) {
                    var d = _b[_a];
                    if (d.raw > 0) {
                        console.log("  ".concat(d.dimension.padEnd(16), " ").concat(d.raw.toFixed(4), " \u00D7 ").concat(d.weight, " = ").concat(d.weighted.toFixed(4)));
                    }
                }
            });
        }, { commands: ['route'] });
        // ══════════════════════════════════════════════════════════════════════
        // Gateway RPC
        // ══════════════════════════════════════════════════════════════════════
        api.registerGatewayMethod('route.decide', function (_a) {
            var params = _a.params, respond = _a.respond;
            var message = params.message;
            if (!message) {
                respond(false, { error: 'message parameter required' });
                return;
            }
            var decision = (0, engine_1.route)(message, pluginConfig);
            trackDecision(decision);
            (0, logger_1.logDecision)(decision, pluginConfig.logging, log);
            respond(true, decision);
        });
        api.registerGatewayMethod('route.stats', function (_a) {
            var respond = _a.respond;
            respond(true, stats);
        });
    },
};
exports.default = clawRouterPlugin;
