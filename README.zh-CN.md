# 🔀 @aiwaretop/claw-router

> **[OpenClaw](https://openclaw.app) 智能模型路由插件** — 根据消息复杂度自动选择最佳模型。

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![OpenClaw Plugin](https://img.shields.io/badge/OpenClaw-plugin-purple.svg)](https://openclaw.app)

[English](README.md) | **中文**

---

## 为什么需要它？

不是每条消息都需要最强的模型。"你好" 用快速便宜的模型就够了，而"设计一个分布式系统" 则需要顶级模型来处理。**Claw Router** 自动帮你做这个决策 — 纯本地计算，< 1ms，零 API 调用。

```
用户: "你好"           → TRIVIAL  → doubao-seed-code    （快速、便宜）
用户: "写个爬虫"        → COMPLEX  → gpt-5.3-codex-high （强力）
用户: "设计分布式架构"    → EXPERT   → claude-opus-4      （最强）
```

---

## 架构图

```
┌─────────────────────────────────────────────────────────┐
│                      用户消息                            │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
              ┌────────────────┐
              │   硬规则检查    │ ◄── 短消息？3+代码块？
              │  (< 0.01 ms)   │     "系统设计"？
              └───────┬────────┘
                      │ 无匹配
                      ▼
     ┌────────────────────────────────────┐
     │       8 维评分引擎                   │
     │                                     │
     │  推理深度(0.20)  代码技术(0.18)       │
     │  任务步骤(0.15)  领域专业(0.12)       │
     │  输出复杂(0.10)  创意要求(0.10)       │
     │  上下文(0.08)    消息长度(0.07)       │
     └───────────────────┬────────────────┘
                         │
                         ▼
              ┌──────────────────┐
              │ Sigmoid 校准      │
              │   Σ(wᵢ·sᵢ) → σ   │
              └────────┬─────────┘
                       │
                       ▼
     ┌─────────────────────────────────────┐
     │           Tier 映射                  │
     │  [0.00,0.15) → TRIVIAL（极简）        │
     │  [0.15,0.35) → SIMPLE（简单）         │
     │  [0.35,0.55) → MODERATE（中等）       │
     │  [0.55,0.75) → COMPLEX（复杂）        │
     │  [0.75,1.00] → EXPERT（专家）         │
     └─────────────────┬───────────────────┘
                       │
                       ▼
              ┌────────────────┐
              │  选择模型       │ → 主模型 / 备用模型
              └────────────────┘
```

---

## 快速开始

### 1. 安装

```bash
cd ~/.openclaw
npm install @aiwaretop/claw-router
```

### 2. 启用插件

在 OpenClaw 配置中添加（`~/.openclaw/openclaw.json`）：

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

### 3. 配置（可选）

**重要：** 插件配置必须放在 `config` 字段下：

```json
{
  "plugins": {
    "entries": {
      "claw-router": {
        "enabled": true,
        "config": {
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

## 功能

### 🎯 Agent 工具：`smart_route`

Agent 可以调用此工具获取路由建议：

```
工具: smart_route
输入: { "message": "帮我设计一个分布式缓存系统" }
输出: {
  "tier": "EXPERT",
  "model": "api-proxy-claude/claude-opus-4-6",
  "score": 0.8234,
  "dimensions": { "reasoning": 0.5, "codeTech": 0.65, ... }
}
```

### 💬 自动回复命令：`/route`

在聊天中输入 `/route` 查看路由状态和统计数据。

### 🖥️ CLI 命令

```bash
# 查看路由状态
openclaw route status

# 测试消息路由
openclaw route test "请帮我写一个排序算法"
```

### 🔌 Gateway RPC

```javascript
await rpc('route.decide', { message: '...' });
await rpc('route.stats');
```

---

## 配置参考

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `tiers` | `Record<Tier, { primary, fallback? }>` | 全部 `"default"` | 每个 Tier 对应的模型 |
| `thresholds` | `[n, n, n, n]` | `[0.15, 0.35, 0.55, 0.75]` | Tier 分界阈值 |
| `scoring.weights` | `Record<Dimension, number>` | 见下表 | 覆盖维度权重 |
| `logging` | `boolean` | `false` | 启用详细路由日志 |

### 默认权重

| 维度 | 键名 | 权重 |
|------|------|------|
| 推理深度 | `reasoning` | 0.20 |
| 代码/技术 | `codeTech` | 0.18 |
| 任务步骤 | `taskSteps` | 0.15 |
| 领域专业度 | `domainExpert` | 0.12 |
| 输出复杂度 | `outputComplex` | 0.10 |
| 创意要求 | `creativity` | 0.10 |
| 上下文依赖 | `contextDepend` | 0.08 |
| 消息长度 | `messageLength` | 0.07 |

### 硬规则（优先级高于评分）

| 条件 | 结果 |
|------|------|
| 消息 ≤ 5 字符且无技术词 | → TRIVIAL |
| 3+ 个代码块 (```) | → COMPLEX |
| 包含"系统设计""架构设计""从零搭建" | → EXPERT |

---

## 评分原理

1. **关键词匹配** — 每个维度有中英文关键词库。匹配使用 soft-max 累积：`score = 1 - ∏(1 - wᵢ)`，自然趋近于 1.0。

2. **长度评分** — 字符数到 0-1 的分段线性映射。

3. **加权求和** — `rawSum = Σ(维度分数 × 权重)`

4. **Sigmoid 校准** — `calibrated = σ(rawSum)`，参数 `k=4, midpoint=0.5`

5. **Tier 映射** — 校准后的分数通过阈值映射到对应 Tier。

---

## 开发

```bash
git clone https://github.com/HackSing/claw-router.git
cd claw-router
npm install
npm test
```

---

## 许可证

[MIT](LICENSE) © aiwaretop
