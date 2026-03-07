---
name: claw-router
description: Trait-based intelligent model routing — automatically routes messages to the best AI model
---

# Smart Router Skill

## What It Does

Automatically selects the optimal AI model for each message based on **complexity tier** and **task type**, matched against user-declared model trait profiles.

## How It Works

```
Message → 8-dimension scoring → Tier (complexity)
        → Keyword classification → TaskType (scenario)
        → Extract traits [Tier, TaskType]
        → Score each model's traits against message traits
        → Select best match (LLM arbitration if tied)
```

## Complexity Tiers

| Tier | Scenario |
|------|----------|
| TRIVIAL | Greetings, confirmations, emoji |
| SIMPLE | One-step Q&A, translations, lookups |
| MODERATE | Writing, comparisons, summaries |
| COMPLEX | Coding, debugging, multi-step analysis |
| EXPERT | System design, formal proofs, architecture |

## Task Types

| Type | Scenario |
|------|----------|
| coding | Programming, debugging, code generation |
| writing | Writing, creative content, copywriting |
| chat | Casual conversation, greetings |
| analysis | Reasoning, comparison, evaluation |
| translation | Translation |
| math | Mathematics, formulas, calculations |
| research | Research, papers, literature review |
| other | Unclassified (default fallback) |

## Configuration

Declare a `models` array in OpenClaw plugin config. Each model specifies an `id` and its `traits`:

```json
{
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
  ]
}
```

**Trait vocabulary** (fixed):
- Tier: `TRIVIAL` / `SIMPLE` / `MODERATE` / `COMPLEX` / `EXPERT`
- TaskType: `coding` / `writing` / `chat` / `analysis` / `translation` / `math` / `research` / `other`

When `models` is not configured, all messages use the `default` model (no routing).

## LLM Assist (Optional)

When enabled, LLM is invoked in two scenarios:
1. **Score boundary**: Rule-based score falls near a tier threshold — LLM refines the complexity judgment
2. **Model arbitration**: Multiple models tie on match score — LLM picks the best one

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

## Commands

- `/route` — Show routing status and stats
- `/route <message>` — Test-route a message
- Agent tool `claw_route` — Programmatic routing query

## Running Tests

```bash
npx tsx --test test/engine.test.ts test/scorer.test.ts test/task-classifier.test.ts test/model-matcher.test.ts
```
