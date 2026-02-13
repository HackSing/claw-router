# Changelog

All notable changes to this project will be documented in this file.

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
