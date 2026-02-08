# Smart Router Skill

## What It Does
Automatically analyzes incoming messages and routes them to the most appropriate AI model based on complexity.

## How It Works
1. Message arrives → 8-dimension scoring engine evaluates complexity
2. Dimensions: reasoning depth, code/tech, task steps, domain expertise, output complexity, creativity, context dependency, message length
3. Weighted score → sigmoid calibration → tier assignment
4. Tier maps to configured model

## Tiers
- **TRIVIAL** — greetings, emoji, simple confirmations
- **SIMPLE** — one-step questions, translations, lookups
- **MODERATE** — writing, comparisons, summaries
- **COMPLEX** — coding, debugging, multi-step analysis
- **EXPERT** — system design, formal proofs, architecture

## Commands
- `/route` — show current routing status and stats
- Agent tool `smart_route` — programmatic routing queries

## Configuration
Set in OpenClaw plugin config. See README for full schema.
