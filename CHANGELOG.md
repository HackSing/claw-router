# Changelog

All notable changes to this project will be documented in this file.

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
- **Logging Visibility**: Fixed `logDecision` to use `console.log` directly instead of `logger.info`, ensuring routing decision logs always appear in OpenClaw logs regardless of log level configuration.

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
- **Logging not showing in OpenClaw Gateway**: The `logDecision` function was using `console.log` directly, which doesn't appear in OpenClaw's structured logging system. Fixed by adding optional `logger` parameter to `logDecision` and passing `api.logger` from the plugin registration context.

### Technical Details
- Modified `src/logger.ts`: Added `Logger` interface and optional `logger` parameter to `logDecision` function
- Modified `index.ts`: Updated three call sites (`before_agent_start` hook, `smart_route` tool, and `route.decide` RPC) to pass the logger

### Before (broken)
```typescript
logDecision(decision, pluginConfig.logging);  // Uses console.log, not captured by OpenClaw
```

### After (fixed)
```typescript
logDecision(decision, pluginConfig.logging, log);  // Uses api.logger.info()
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
