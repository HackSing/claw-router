# 🔀 @aiwaretop/claw-router

> **Intelligent model routing for [OpenClaw](https://openclaw.app)** — declare model traits, let the router match automatically.

[![AIWare Community License](https://img.shields.io/badge/license-AIWare%20Community%20License-blue.svg)](LICENSE)
[![OpenClaw Plugin](https://img.shields.io/badge/OpenClaw-plugin-purple.svg)](https://openclaw.app)

---

## Why?

Not every message needs GPT-4 or Claude Opus. A "hello" can go to a fast, cheap model. A system-design question deserves the best. **Claw Router** makes this decision for you:

- **Trait-based matching**: Declare what each model is good at, the router does the matching
- **Rule-only mode**: Local computation, < 1ms, zero API calls
- **LLM-assisted mode**: Triggers LLM for tier boundary refinement and model conflict arbitration
- **Turn-by-turn re-routing**: Session model overrides are cleared after `agent_end`, so each new message is routed again instead of inheriting the previous turn's model

```
User: "hi"           → TRIVIAL  → doubao-seed-code     (fast, cheap)
User: "写个爬虫"      → COMPLEX  → gpt-5.3-codex-high  (example outcome)
User: "设计分布式架构"  → EXPERT   → claude-opus-4       (best)
```

---

## Installation

You have two options to install claw-router:

### Option 1: Install from npm (Recommended)

```bash
# In your OpenClaw workspace
cd ~/.openclaw

# Install the package
npm install @aiwaretop/claw-router

# Copy to extensions directory (required!)
cp -r node_modules/@aiwaretop/claw-router ~/.openclaw/extensions/claw-router
```

**Note:** OpenClaw only loads plugins from `~/.openclaw/extensions/` by default. You must copy the files manually after npm install.

### Option 2: Install from source

```bash
# Clone the repository
git clone https://github.com/HackSing/claw-router.git

# Install dependencies
cd claw-router
npm install

# Compile TypeScript to JavaScript
npx tsc

# Copy to extensions directory
cp -r . ~/.openclaw/extensions/claw-router
```

---

## Quick Start

### 1. Enable the Plugin

Add to your OpenClaw config (`~/.openclaw/openclaw.json`):

```json
{
  "plugins": {
    "enabled": true,
    "allow": ["claw-router"],
    "entries": {
      "claw-router": {
        "enabled": true
      }
    }
  }
}
```

### 2. Configure Models

**Important:** Plugin config must be placed under the `config` key. Declare each model's traits (what it's good at):

```json
{
  "plugins": {
    "entries": {
      "claw-router": {
        "enabled": true,
        "config": {
          "models": [
            {
              "id": "anthropic/claude-sonnet",
              "traits": ["coding", "analysis", "COMPLEX", "EXPERT"]
            },
            {
              "id": "openai/gpt-4o-mini",
              "traits": ["chat", "translation", "TRIVIAL", "SIMPLE"]
            },
            {
              "id": "google/gemini-pro",
              "traits": ["writing", "research", "MODERATE", "COMPLEX"]
            }
          ],
          "logging": true
        }
      }
    }
  }
}
```

Trait vocabulary (fixed):
- **Tier**: `TRIVIAL`, `SIMPLE`, `MODERATE`, `COMPLEX`, `EXPERT`
- **TaskType**: `coding`, `writing`, `chat`, `analysis`, `translation`, `math`, `research`, `other`

---

## Hook Behavior Notes

- `before_agent_start` only applies routing for `trigger === "user"`
- Background triggers such as memory flush are ignored for routing decisions
- The plugin writes a temporary model override before the run, then clears it in `agent_end`
- If OpenClaw invokes repeated user hooks for the same turn, only the first successful override emits the full routing decision log

## Architecture

```
┌──────────────────────────────────────────────────┐
│                    User Message                  │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
              ┌────────────────┐
              │  Hard Overrides  │ ◄── ≤5 chars? 3+ code blocks? "system design"?
              └───────┬───────┘
                      │ no match
                      ▼
            ┌────────────────────────────────────────┐
            │  Semantic Routing (if enabled, default on)    │
            │  bge-small-zh-v1.5 · cosine similarity      │
            └────────────────────┬───────────────────┘
                                   │ tier hint (or skip)
                                   ▼
 ┌──────────────────────────┐  ┌────────────────────┐
 │ 8-Dimension Heuristic         │  │ Context-Awareness    │
 │ Scorer (<1ms) → Tier          │  │ history boost        │
 └────────────┬─────────────┘  └────────┬───────────┘
              └───────────────────────────────┘
                                   ▼ │ LLM refine if near boundary
                                   │
 ┌──────────────────────────┐  ┌────────────────────┐
 │ Task Classifier               │  │ Trait Matcher        │
 │ keywords → TaskType           │  │ score + select model │
 └────────────┬─────────────┘  └────────┬───────────┘
              └───────────────────────────────┘
                                   │ (tied → LLM Arbitration)
                                   ▼
                        ┌────────────┐
                        │ Final Model  │
                        └────────────┘
```

---

## Features

### 🎯 Agent Tool: `claw_route`

The agent can call this tool to get routing recommendations:

```
Tool: claw_route
Input: { "message": "Design a distributed caching system with sharding" }
Output: {
  "tier": "EXPERT",
  "taskType": "coding",
  "model": "anthropic/claude-sonnet",
  "matchSource": "trait",
  "score": 0.8234,
  "candidates": [...]
}
```

### 💬 Auto-reply Command: `/route`

Type `/route` in chat to see current router status and statistics.

### 🖥️ CLI Commands

```bash
# Check router status
openclaw route status

# Test a message
openclaw route test "Help me write a sorting algorithm"
```

### 🔌 Gateway RPC

```javascript
// Programmatic access
await rpc('route.decide', { message: '...' });
await rpc('route.stats');
```

---

## Configuration Reference

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `models` | `ModelProfile[]` | `[{id:'default', traits:[...all]}]` | Model trait declarations |
| `thresholds` | `[n, n, n, n]` | `[0.20, 0.42, 0.58, 0.78]` | Score boundaries between tiers |
| `scoring.weights` | `Record<Dimension, number>` | See below | Override dimension weights |
| `logging` | `boolean` | `false` | Enable verbose decision logs |
| `enableSemanticRouting` | `boolean` | `true` | 启用本地 embedding 语义路由（bge-small-zh-v1.5）。首次启动自动下载模型，后续冷启动读磁盘 anchor 缓存。设为 `false` 可禁用 |
| `llmScoring.enabled` | `boolean` | `false` | Enable LLM-assisted scoring & arbitration |
| `llmScoring.model` | `string` | — | LLM model for scoring/arbitration |
| `llmScoring.apiKey` | `string` | — | LLM API key |
| `llmScoring.baseUrl` | `string` | — | LLM API base URL |
| `llmScoring.apiPath` | `string` | `/v1/chat/completions` | API endpoint path |

### LLM Assist (Optional)

```json
{
  "llmScoring": {
    "enabled": true,
    "model": "deepseek-ai/DeepSeek-V3-Chat",
    "apiKey": "sk-xxx",
    "baseUrl": "https://api.siliconflow.cn"
  }
}
```

LLM is invoked in two scenarios:
1. **Tier boundary**: Rule score near threshold (±0.08) — LLM refines complexity, so most messages skip LLM calls
2. **Model arbitration**: Multiple models tie on trait match — LLM picks best one

Includes 3-second timeout with automatic fallback.

### Default Weights

| Dimension | Key | Weight |
|-----------|-----|--------|
| Reasoning Depth | `reasoning` | 0.20 |
| Code / Tech | `codeTech` | 0.18 |
| Task Steps | `taskSteps` | 0.15 |
| Domain Expertise | `domainExpert` | 0.12 |
| Output Complexity | `outputComplex` | 0.10 |
| Creativity | `creativity` | 0.10 |
| Context Dependency | `contextDepend` | 0.08 |
| Message Length | `messageLength` | 0.07 |

### Hard Rules (Override)

These take priority over scoring:

| Condition | Result |
|-----------|--------|
| Message ≤ 5 chars, no tech words | → TRIVIAL |
| Multiple code fences with sufficient code volume | → COMPLEX |
| Contains "system design", "from scratch", etc. | → EXPERT |

---

## How Scoring Works

1. **Keyword matching** — Each dimension has a bilingual (CN + EN) keyword library. Matches accumulate via soft-max: `score = 1 - ∏(1 - wᵢ)`, naturally saturating toward 1.0.

2. **Length scoring** — Piecewise linear mapping from character count to 0–1.

3. **Weighted sum** — `rawSum = Σ(dimensionScore × weight)`

4. **Sigmoid calibration** — `calibrated = 1 / (1 + exp(-k·(rawSum - midpoint)))` with grid-search optimized parameters: `k=8, midpoint=0.18`. The S-curve provides better tier discrimination in the mid-range.

5. **Tier mapping** — Calibrated score mapped to tier via thresholds `[0.20, 0.42, 0.58, 0.78]`.

---

## Development

```bash
git clone https://github.com/HackSing/claw-router.git
cd claw-router
npm install
npm test
```

### Project Structure

```
claw-router/
├── index.ts                    # 插件入口
├── openclaw.plugin.json        # 插件清单 & 配置 Schema
├── src/
│   ├── router/
│   │   ├── engine.ts             # 路由主流程
│   │   ├── semantic.ts           # 语义路由（本地嵌入 + anchor 缓存）
│   │   ├── context.ts            # 历史上下文感知
│   │   ├── math-utils.ts         # 共享数学工具（calibrate/scoreToTier/clamp）
│   │   ├── semantic-signals.ts   # 语义信号提取
│   │   ├── model-matcher.ts      # Trait 匹配引擎
│   │   ├── task-classifier.ts    # 任务类型分类器
│   │   ├── scorer.ts             # 8 维度评分
│   │   ├── llm-scorer.ts         # LLM 评分 & 仲裁
│   │   ├── keywords.ts           # 中英文关键词库
│   │   ├── overrides.ts          # 硬规则覆盖
│   │   └── types.ts              # 全局类型（含 ResolvedConfig）
│   ├── config.ts               # 配置解析 & 验证
│   └── logger.ts               # 决策日志
├── test/
│   ├── engine.test.ts          # 端到端集成测试
│   ├── extended-data.test.ts   # 真实业务极端用例
│   ├── model-matcher.test.ts   # Trait 匹配测试
│   ├── scorer.test.ts          # 维度评分测试
│   ├── task-classifier.test.ts # 任务分类测试
│   └── fixtures.ts             # 35+ 测试固件
└── skills/
    └── claw-router/SKILL.md
```

---

## Roadmap

See [ROADMAP.md](./ROADMAP.md) for detailed development plans.

### Recent Updates ✅

**v2.0.1 (Released)**
- ✅ 打破循环依赖：新增 `math-utils.ts` 统一存放共享算法
- ✅ LRU 缓存修复、跨平台路径修复、类型安全提升
- ✅ Anchor 向量磁盘缓存（`~/.claw-router/anchor-cache.json`）
- ✅ 162 测试用例 / 24 个套件

**v2.0.0 (Released)**
- ✅ Trait-based model routing: declare model capabilities, router matches automatically
- ✅ 历史上下文感知 (Context-Awareness)
- ✅ 本地语义路由 (Semantic Routing): bge-small-zh-v1.5 + 余弦相似度
- ✅ LLM arbitration for tied model candidates
- ✅ Task types expanded: +math, +research

### Coming Soon 🚀

- **Learning & Feedback** — Record routing decisions and adapt based on user corrections
- **Route Decision Visualization** — Web UI with radar charts and historical trends

---

## Contributing

We welcome contributions! Please see [ROADMAP.md](./ROADMAP.md#贡献指南) for details.

### Quick Start

```bash
# Fork and clone
git clone https://github.com/your-username/claw-router.git
cd claw-router
npm install
npm test
```

### Reporting Issues

- Use GitHub Issues with provided templates
- Include environment info and reproduction steps
- Check existing issues first

---

## Community

- **GitHub Discussions**: https://github.com/HackSing/claw-router/discussions
- **Twitter/X**: [@WareAi996](https://x.com/WareAi996)

---

## License

[AIWare Community License](LICENSE) © aiwaretop
