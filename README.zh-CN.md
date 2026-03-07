# 🔀 @aiwaretop/claw-router

> **[OpenClaw](https://openclaw.app) 智能模型路由插件** — 声明模型能力特征，插件自动匹配最优模型。

[![AIWare Community License](https://img.shields.io/badge/license-AIWare%20Community%20License-blue.svg)](LICENSE)
[![OpenClaw Plugin](https://img.shields.io/badge/OpenClaw-plugin-purple.svg)](https://openclaw.app)

[English](README.md) | **中文**

---

## 为什么需要它？

不是每条消息都需要最强的模型。"你好" 用快速便宜的模型就够了，而"设计一个分布式系统" 则需要顶级模型来处理。**Claw Router** 自动帮你做这个决策：

- **Trait 匹配路由**：声明每个模型擅长什么，路由器自动匹配
- **纯规则模式**：本地计算，< 1ms，零 API 调用
- **LLM 辅助模式**：Tier 边界精化 + 多模型冲突仲裁

```
用户: "你好"           → TRIVIAL  → doubao-seed-code    （快速、便宜）
用户: "写个爬虫"        → COMPLEX  → gpt-5.3-codex-high （示意结果）
用户: "设计分布式架构"    → EXPERT   → claude-opus-4      （最强）
```

---

## 架构图

```
┌──────────────────────────────────────────────────┐
│                    用户消息                        │
└──────────────────────┬───────────────────────────┘
                       │
                       ▼
              ┌────────────────┐
              │   硬规则检查    │ ◄── ≤5字符? 3+代码块? "系统设计"?
              └───────┬────────┘
                      │ 无匹配
                      ▼
     ┌────────────────────────────────────┐
     │  8 维规则评分引擎 (< 1ms)          │ → Tier
     └───────────────────┬────────────────┘
                         │
                         ▼
     ┌────────────────────────────────────┐
     │  任务分类器（关键词匹配）            │ → TaskType
     └───────────────────┬────────────────┘
                         │
                         ▼
     ┌────────────────────────────────────┐
     │  Trait 匹配引擎                    │
     │  traits = [Tier, TaskType]         │
     │  对每个模型的 traits 评分           │
     │  选择最高分模型                     │
     └───────────────────┬────────────────┘
                  ┌──────┴──────┐
            唯一最高分    多个并列
                  │              │
                  │              ▼
                  │    ┌──────────────────┐
                  │    │ LLM 仲裁         │
                  │    │（选择最优模型）    │
                  │    └────────┬─────────┘
                  │             │
                  └──────┬──────┘
                         ▼
              ┌────────────────┐
              │   最终模型      │
              └────────────────┘
```

---

## 安装方式

有两种安装方式：

### 方式一：从 npm 安装（推荐）

```bash
# 进入 OpenClaw 工作目录
cd ~/.openclaw

# 安装 npm 包
npm install @aiwaretop/claw-router

# 复制到 extensions 目录（必须步骤！）
cp -r node_modules/@aiwaretop/claw-router ~/.openclaw/extensions/claw-router
```

**注意：** OpenClaw 默认只从 `~/.openclaw/extensions/` 加载插件。npm 安装后必须手动复制！

### 方式二：从源码安装

```bash
# 克隆仓库
git clone https://github.com/HackSing/claw-router.git

# 安装依赖
cd claw-router
npm install

# 编译 TypeScript 到 JavaScript
npx tsc

# 复制到 extensions 目录
cp -r . ~/.openclaw/extensions/claw-router
```

---

## 快速开始

### 1. 启用插件

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

### 2. 配置模型

**重要：** 插件配置必须放在 `config` 字段下。声明每个模型的 traits（能力特征）：

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

Trait 词表（固定）：
- **Tier**: `TRIVIAL`, `SIMPLE`, `MODERATE`, `COMPLEX`, `EXPERT`
- **TaskType**: `coding`, `writing`, `chat`, `analysis`, `translation`, `math`, `research`, `other`

---

## 功能

### 🎯 Agent 工具：`claw_route`

Agent 可以调用此工具获取路由建议：

```
工具: claw_route
输入: { "message": "帮我设计一个分布式缓存系统" }
输出: {
  "tier": "EXPERT",
  "taskType": "coding",
  "model": "anthropic/claude-sonnet",
  "matchSource": "trait",
  "score": 0.8234,
  "candidates": [...]
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
| `models` | `ModelProfile[]` | `[{id:'default', traits:[...all]}]` | 模型能力声明 |
| `thresholds` | `[n, n, n, n]` | `[0.20, 0.42, 0.58, 0.78]` | Tier 分界阈值 |
| `scoring.weights` | `Record<Dimension, number>` | 见下表 | 覆盖维度权重 |
| `logging` | `boolean` | `false` | 启用详细路由日志 |
| `llmScoring.enabled` | `boolean` | `false` | 启用 LLM 辅助评分与仲裁 |
| `llmScoring.model` | `string` | — | LLM 评分/仲裁模型 |
| `llmScoring.apiKey` | `string` | — | LLM API Key |
| `llmScoring.baseUrl` | `string` | — | LLM API 地址 |
| `llmScoring.apiPath` | `string` | `/v1/chat/completions` | API 端点路径 |

### LLM 辅助（可选）

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

LLM 在两个场景触发：
1. **Tier 边界**：规则评分处于阈值边界区间（±0.08）— LLM 精化复杂度判断，因此大多数消息会跳过 LLM 调用
2. **模型仲裁**：多个模型 trait 匹配并列 — LLM 选择最优

包含 3 秒超时保护，超时自动回退到规则结果。

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
| 多代码块且代码量达到阈值 | → COMPLEX |
| 包含"系统设计""架构设计""从零搭建" | → EXPERT |

---

## 评分原理

1. **关键词匹配** — 每个维度有中英文关键词库。匹配使用 soft-max 累积：`score = 1 - ∏(1 - wᵢ)`，自然趋近于 1.0。

2. **长度评分** — 字符数到 0-1 的分段线性映射。

3. **加权求和** — `rawSum = Σ(维度分数 × 权重)`

4. **Sigmoid 校准** — `calibrated = 1 / (1 + exp(-k·(rawSum - midpoint)))`，参数经网格搜索优化：`k=8, midpoint=0.18`。S 曲线在中间区间提供更好的 tier 分辨力。

5. **Tier 映射** — 校准后的分数通过阈值 `[0.20, 0.42, 0.58, 0.78]` 映射到对应 Tier。

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

[AIWare Community License](LICENSE) © aiwaretop
