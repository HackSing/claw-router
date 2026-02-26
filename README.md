# 🔀 @aiwaretop/claw-router

> **Intelligent model routing for [OpenClaw](https://openclaw.app)** — route every message to the right model, automatically.

[![AIWare Community License](https://img.shields.io/badge/license-AIWare%20Community%20License-blue.svg)](LICENSE)
[![OpenClaw Plugin](https://img.shields.io/badge/OpenClaw-plugin-purple.svg)](https://openclaw.app)

---

## Why?

Not every message needs GPT-4 or Claude Opus. A "hello" can go to a fast, cheap model. A system-design question deserves the best. **Claw Router** makes this decision for you:

- **Rule-only mode**: Local computation, < 1ms, zero API calls
- **LLM-assisted mode**: Only triggers LLM when rule-based score is near tier boundaries (±0.08), ~70% messages skip LLM calls

```
User: "hi"           → TRIVIAL  → doubao-seed-code     (fast, cheap)
User: "写个爬虫"      → COMPLEX  → gpt-5.3-codex-high  (capable)
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

### 3. Configure (Optional)

**Important:** Plugin config must be placed under the `config` key:

```json
{
  "plugins": {
    "entries": {
      "claw-router": {
        "enabled": true,
        "config": {
          "thresholds": [0.15, 0.40, 0.55, 0.75],
          "tiers": {
            "TRIVIAL":  { "primary": "volcengine/doubao-seed-code" },
            "SIMPLE":   { "primary": "volcengine/doubao-seed-code" },
            "MODERATE": { "primary": "api-proxy-gpt/gpt-5.3-codex-high" },
            "COMPLEX":  { "primary": "api-proxy-gpt/gpt-5.3-codex-high" },
            "EXPERT":   { "primary": "api-proxy-claude/claude-opus-4-6" }
          },
          "logging": true
        }
      }
    }
  }
}
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    User Message                         │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
              ┌────────────────┐
              │  Hard Overrides │ ◄── Short msg? 3+ code blocks?
              │  (< 0.01 ms)   │     "系统设计"?
              └───────┬────────┘
                      │ no match
                      ▼
     ┌────────────────────────────────────┐
     │      8-Dimension Scoring Engine     │
     │                                     │
     │  ┌─────────────┐ ┌──────────────┐  │
     │  │  Reasoning   │ │  Code/Tech   │  │
     │  │  (w: 0.20)   │ │  (w: 0.18)   │  │
     │  └─────────────┘ └──────────────┘  │
     │  ┌─────────────┐ ┌──────────────┐  │
     │  │  Task Steps  │ │  Domain      │  │
     │  │  (w: 0.15)   │ │  (w: 0.12)   │  │
     │  └─────────────┘ └──────────────┘  │
     │  ┌─────────────┐ ┌──────────────┐  │
     │  │  Output      │ │  Creativity  │  │
     │  │  (w: 0.10)   │ │  (w: 0.10)   │  │
     │  └─────────────┘ └──────────────┘  │
     │  ┌─────────────┐ ┌──────────────┐  │
     │  │  Context     │ │  Length      │  │
     │  │  (w: 0.08)   │ │  (w: 0.07)   │  │
     │  └─────────────┘ └──────────────┘  │
     └───────────────────┬────────────────┘
                         │
                         ▼
              ┌──────────────────┐
              │ Sigmoid Calibrate │
              │   Σ(wᵢ·sᵢ) → σ   │
              └────────┬─────────┘
                       │
                       ▼
     ┌─────────────────────────────────────┐
     │           Tier Mapping               │
     │  [0.00,0.15) → TRIVIAL              │
     │  [0.15,0.35) → SIMPLE               │
     │  [0.35,0.55) → MODERATE              │
     │  [0.55,0.75) → COMPLEX              │
     │  [0.75,1.00] → EXPERT               │
     └─────────────────┬───────────────────┘
                       │
                       ▼
              ┌────────────────┐
              │  Model Selection│ → primary / fallback
              └────────────────┘
```

---

## Features

### 🎯 Agent Tool: `smart_route`

The agent can call this tool to get routing recommendations:

```
Tool: smart_route
Input: { "message": "帮我设计一个分布式缓存系统" }
Output: {
  "tier": "EXPERT",
  "model": "api-proxy-claude/claude-opus-4-6",
  "score": 0.8234,
  "dimensions": {
    "reasoning": 0.5,
    "codeTech": 0.65,
    "domainExpert": 0.7,
    ...
  }
}
```

### 💬 Auto-reply Command: `/route`

Type `/route` in chat to see current router status and statistics.

### 🖥️ CLI Commands

```bash
# Check router status
openclaw route status

# Test a message
openclaw route test "请帮我写一个排序算法"
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
| `tiers` | `Record<Tier, { primary, fallback? }>` | all `"default"` | Model mapping per tier |
| `thresholds` | `[n, n, n, n]` | `[0.15, 0.40, 0.55, 0.75]` | Score boundaries between tiers |
| `scoring.weights` | `Record<Dimension, number>` | See below | Override dimension weights |
| `logging` | `boolean` | `false` | Enable verbose decision logs |
| `llmScoring.enabled` | `boolean` | `false` | Enable LLM-assisted scoring |
| `llmScoring.model` | `string` | — | LLM model for classification |
| `llmScoring.apiKey` | `string` | — | LLM API key |
| `llmScoring.baseUrl` | `string` | — | LLM API base URL |
| `llmScoring.apiPath` | `string` | `/v1/chat/completions` | API endpoint path |

### LLM-Assisted Scoring

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

LLM scoring **only triggers when the rule-based score falls within ±0.08 of a tier threshold**, skipping ~70% of messages. Includes a 3-second timeout with automatic fallback to rule-based results.

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
| 3+ code fences (```) | → COMPLEX |
| Contains "系统设计", "架构设计", "从零搭建" | → EXPERT |

---

## How Scoring Works

1. **Keyword matching** — Each dimension has a bilingual (CN + EN) keyword library. Matches accumulate via soft-max: `score = 1 - ∏(1 - wᵢ)`, naturally saturating toward 1.0.

2. **Length scoring** — Piecewise linear mapping from character count to 0–1.

3. **Weighted sum** — `rawSum = Σ(dimensionScore × weight)`

4. **Sigmoid calibration** — `calibrated = σ(rawSum)` with `k=4, midpoint=0.5`

5. **Tier mapping** — Calibrated score mapped to tier via thresholds.

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
├── index.ts                  # Plugin entry point
├── openclaw.plugin.json      # Plugin manifest
├── src/
│   ├── router/
│   │   ├── engine.ts         # Routing engine (orchestrator)
│   │   ├── scorer.ts         # 8-dimension scorer
│   │   ├── keywords.ts       # Bilingual keyword library
│   │   ├── overrides.ts      # Hard-rule overrides
│   │   └── types.ts          # TypeScript types
│   ├── config.ts             # Configuration resolver
│   └── logger.ts             # Decision logger
├── test/
│   ├── engine.test.ts        # Integration tests
│   ├── scorer.test.ts        # Unit tests
│   └── fixtures.ts           # 35+ test cases
└── skills/
    └── smart-router/
        └── SKILL.md
```

---

## Roadmap

See [ROADMAP.md](./ROADMAP.md) for detailed development plans.

### Recent Updates ✅

**v1.1.0 (In Progress)**
- ✅ Improved code context detection with regex patterns
- ✅ Enhanced complexity signal matching
- 📝 Adding more test cases
- 📝 Expanding keyword library

### Coming Soon 🚀

- **Learning & Feedback** — Record routing decisions and adapt based on user corrections
- **Context-Aware Routing** — Consider conversation history for better decisions
- **Visual Dashboard** — Web UI for routing analytics and 8-dimension radar charts
- **More Model Providers** — Hugging Face, Together, Groq, local models (Ollama)

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
