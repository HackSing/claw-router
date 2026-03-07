# Changelog

All notable changes to this project will be documented in this file.

## [2.0.1] - 2026-03-07

### 🔧 Code Quality & Refactoring

#### 架构
- **打破循环依赖**：将 `calibrate`、`scoreToTier`、`clamp`、`lerp` 提取到新增的 `math-utils.ts`，消除了 `context.ts ↔ engine.ts` 的双向循环导入
- **统一 Tier→Score 映射**：新增 `TIER_CALIBRATED_SCORES` 常量作为全局唯一数据源，移除 `engine.ts` 和 `llm-scorer.ts` 中各自维护的独立映射（原本数值还不一致）
- **`ResolvedConfig` 集中化**：将接口从 `config.ts` 迁移至 `types.ts`，`config.ts` 改为重新导出，`engine.ts` 直接从 `types.ts` 导入

#### 类型安全
- **`semantic.ts` 消除 `any`**：定义 `Extractor` 接口替代 `any`，删除全部 `@ts-ignore` 注释，通过 try-catch 安全设置 ONNX WASM 线程数

#### 性能
- **Anchor 向量磁盘缓存**（`semantic.ts`）：首次推理后将 anchor 向量序列化至 `~/.claw-router/anchor-cache.json`，后续冷启动直接读取跳过模型推理；通过 MD5 哈希检测 phrases 变化自动失效重建
- **`ZERO_DIMENSIONS` 模块级常量**：`buildOverrideScore` 不再每次调用时重建零维度数组

#### Bug 修复
- **修复伪 LRU**（`cache.ts`）：`get()` 命中时执行 touch（删除再插入），将 FIFO 淘汰策略修正为真正的 LRU
- **修复跨平台路径**（`session.ts`）：用 `os.homedir()` 替换硬编码的 `process.env.HOME || '/home/ubuntu'`，兼容 Windows

#### 代码风格
- `engine.ts` 步骤注释编号统一为 1→2→3→4→5→6，删除重复的"Phase 1"标注
- `task-classifier.ts` 注释中旧名称 `GENERAL` 更新为 `OTHER`
- `scoreOnly()` 添加 JSDoc 说明其不包含 Semantic Routing 的局限性

#### 工程卫生
- 删除根目录 6 个临时调试产物：`test-issue.ts`、`test-debug.ts`、`test-semantic.ts`、`out.log`、`test.log`、`stash-test.log`
- `.gitignore` 补充 `*.log` 和 `/test-*.ts` 规则

### Tests
- 162 测试用例，21+ 套件（新增 11 个真实业务极端用例覆盖 Kubernetes 排查、SQL 注入、数学证明、Prompt 注入等）

---

## [2.0.0] - 2026-03-07


### ⚠️ Breaking Changes
- **Configuration format changed**: `tiers` and `taskRouting` replaced by `models` array
- **RouteDecision type changed**: `fallback` removed, `matchSource` and `candidates` added
- **TaskType enum**: `GENERAL` renamed to `OTHER`

### Added
- **历史上下文感知 (Context-Awareness)**：引入流路由能力，分析多轮历史背景的复杂度并提供短指令补偿，消除上下文断层导致的降权误判。
- **本地语义路由 (Semantic Routing)**：基于 `@xenova/transformers` 构建纯本地特征抽取架构。使用余弦相似度的非正则判定对自然表达进行难度分级，解决传统正则“语境盲区”。
- **Trait-based model routing**: Declare model capabilities via traits, router matches automatically
- **Model Matcher** (`model-matcher.ts`): Trait extraction → model scoring → model selection
- **LLM Arbitration**: When multiple models tie on trait match, LLM picks the best one
- **New TaskTypes**: `math` (mathematics, formulas) and `research` (papers, literature)
- **New types**: `ModelProfile`, `TraitMatchResult`, `MatchSource`
- 142 test cases across 21 suites (up from 75)

### Changed
- `config.ts`: `tiers`/`taskRouting` → `models` array with default fallback model
- `engine.ts`: `finalize()` now async, uses model-matcher + LLM arbitration
- `llm-scorer.ts`: Added `arbitrate()` method with dedicated prompt
- `index.ts`: Logging includes `matchSource` and `candidates`; LLM scoring now reuses the shared `llm-client.ts` request path; routing now prefers the original user message instead of injected prompt context, ignores non-user triggers, suppresses duplicate decision logs across repeated user hook invocations, and clears session model overrides after `agent_end` so each new turn re-routes cleanly
- `logger.ts`: Output includes TaskType, Match source, and hook context such as `agentId` or `sessionKey`, and prefers `api.logger.info()` when a logger is provided
- `src/session.ts`: Added helper to clear per-session model overrides after the run finishes
- `openclaw.plugin.json`: Schema updated, version 2.0.0

### Removed
- `TierModelConfig`, `TaskTypeModelConfig`, `TaskRoutingConfig` types
- `tiers` and `taskRouting` configuration fields

### Configuration Migration

**Old format (v1.x):**
```json
{
  "tiers": {
    "TRIVIAL": { "primary": "fast-model" },
    "EXPERT": { "primary": "best-model" }
  }
}
```

**New format (v2.0):**
```json
{
  "models": [
    { "id": "fast-model", "traits": ["chat", "TRIVIAL", "SIMPLE"] },
    { "id": "best-model", "traits": ["coding", "COMPLEX", "EXPERT"] }
  ]
}
```

## [1.0.4] - 2026-02-14

### Added
- **Token Usage Logging**: Added `agent_end` hook listener that logs token consumption after each agent completion.
  - Input tokens, output tokens, and total tokens
  - Duration of the agent run
  - Actual model name (provider/model) for context
  - Requires OpenClaw with `tokenUsage` field support in `agent_end` hook

### Technical Details
- Modified `index.ts`: Added `agent_end` hook handler that extracts `tokenUsage` from event and logs it
- Log format: `[claw-router] Tokens: <input> in / <output> out (total: <total>, duration: <duration>ms, model: <provider/model>)`
- Requires `logging: true` in plugin config (default: false)

### Note
This feature requires OpenClaw to expose token usage data in the `agent_end` hook. A PR has been submitted to OpenClaw (PR #16049). Until it's merged, users need to manually apply the patch or use a fork with this feature.

## [1.0.3] - 2026-02-14

### Fixed
- **OpenClaw 2026.2.13 Compatibility**: Adapted to new plugin configuration format.
  - New format uses `plugins.load.paths` for local plugin directories
  - `plugins.entries.<id>` now only accepts `enabled` and `config` keys
  - Removed support for `path` and `entry` keys in entries (was causing "Unrecognized keys" error)
- **Logging Visibility**: Standardized `logDecision` to prefer `api.logger.info()` when available, with `console.log` as a fallback for non-plugin contexts.

### Configuration Migration (OpenClaw 2026.2.13+)

**Old format (before 2026.2.13):**
```json
{
  "plugins": {
    "allow": ["claw-router"],
    "entries": {
      "claw-router": {
        "enabled": true,
        "path": "/home/ubuntu/projects/claw-router",
        "entry": "index.ts",
        "config": { "logging": true }
      }
    }
  }
}
```

**New format (2026.2.13+):**
```json
{
  "plugins": {
    "allow": ["claw-router"],
    "load": {
      "paths": ["/home/ubuntu/projects/claw-router"]
    },
    "entries": {
      "claw-router": {
        "enabled": true,
        "config": { "logging": true }
      }
    }
  }
}
```

## [1.0.2] - 2026-02-14

### Fixed
- **Logging not showing in OpenClaw Gateway**: Added optional `logger` support to `logDecision` and updated plugin call sites to pass `api.logger`.

### Technical Details
- Modified `src/logger.ts`: Added `Logger` interface and optional `logger` parameter to `logDecision` function
- Modified `index.ts`: Updated three call sites (`before_agent_start` hook, `smart_route` tool, and `route.decide` RPC) to pass the logger

### Before (broken)
```typescript
logDecision(decision, pluginConfig.logging);  // Uses console.log, not captured by OpenClaw
```

### After (fixed)
```typescript
logDecision(decision, pluginConfig.logging, log);  // Prefers api.logger.info(), falls back to console.log
```

## [1.0.1] - 2026-02-13

### Fixed
- Fixed plugin configuration schema - added `additionalProperties: false` to comply with OpenClaw's strict validation
- Fixed config path - plugin config must be placed under `config` key in `plugins.entries.<id>`

### Changed
- Updated README.md and README.zh-CN.md with correct configuration examples

### Configuration Migration

If you previously had config like this:
```json
{
  "plugins": {
    "@aiwaretop/claw-router": {
      "tiers": { ... },
      "logging": true
    }
  }
}
```

Please update to:
```json
{
  "plugins": {
    "entries": {
      "claw-router": {
        "enabled": true,
        "config": {
          "tiers": { ... },
          "logging": true
        }
      }
    }
  }
}
```

## [1.0.0] - 2026-02-13

### Added
- Initial release
- 8-dimension complexity scoring engine
- 5-tier routing (TRIVIAL, SIMPLE, MODERATE, COMPLEX, EXPERT)
- Bilingual (CN/EN) keyword library
- Hard-rule overrides for edge cases
- Agent tool: `smart_route`
- CLI commands: `openclaw route status/test`
- Gateway RPC: `route.decide`, `route.stats`
- Auto-reply command: `/route`
