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
- **每轮重新路由**：会话级模型覆盖仅对单次请求有效，每次对话都会根据最新诉求自动重新路由

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
            ┌────────────────────────────────────────┐
            │  本地语义路由 (如开启，默认 true)         │
            │  bge-small-zh-v1.5 · cosine similarity │
            └────────────────────┬───────────────────┘
                                 │ tier 提示 (或跳过)
                                 ▼
 ┌──────────────────────────┐  ┌────────────────────┐
 │ 8维启发式规则引擎            │  │ 历史上下文感知        │
 │ 分数计算 (<1ms) → Tier       │  │ 多轮历史复杂度提权      │
 └────────────┬─────────────┘  └────────┬───────────┘
              └─────────────────────────┘
                                 ▼ │ (临界点 LLM 仲裁精化)
                                 │
 ┌──────────────────────────┐  ┌────────────────────┐
 │ 任务分类器                   │  │ Trait 匹配引擎       │
 │ 关键词匹配 → TaskType        │  │ 打分 + 模型选择       │
 └────────────┬─────────────┘  └────────┬───────────┘
              └─────────────────────────┘
                                 │ (并列 → LLM 仲裁唯一)
                                 ▼
                        ┌────────────┐
                        │ 最终派发模型   │
                        └────────────┘
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

> 💡 **不想手写配置？** 请查看代码库中的 [`examples/openclaw-config-example.json`](./examples/openclaw-config-example.json) 样板文件，直接复制粘贴到你的主配置即可。

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
| `enableSemanticRouting` | `boolean` | `true` | 启用本地 embedding 语义路由（bge-small-zh-v1.5）。首次启动自动下载极小模型，后续冷启动读磁盘 anchor 缓存。设为 `false` 可禁用 |
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

### 项目结构

```
claw-router/
├── index.ts                    # 插件入口
├── openclaw.plugin.json        # 插件清单 & 配置 Schema
├── src/
│   ├── router/
│   │   ├── engine.ts             # 路由主流程
│   │   ├── semantic.ts           # 语义路由（本地嵌入 + anchor 缓存）
│   │   ├── context.ts            # 历史上下文感知
│   │   ├── math-utils.ts         # 共享数学工具
│   │   ├── semantic-signals.ts   # 语义信号提取
│   │   ├── model-matcher.ts      # Trait 匹配引擎
│   │   ├── task-classifier.ts    # 任务分类器
│   │   ├── scorer.ts             # 8 维度评分
│   │   ├── llm-scorer.ts         # LLM 仲裁
│   │   └── types.ts              # 全局类型
│   ├── config.ts               # 配置解析
│   └── logger.ts               # 决策日志
├── test/
│   ├── extended-data.test.ts   # 业务边界极端用例
│   └── *.test.ts               # 单元集成测试
├── examples/                   # 使用示例 & 配置模板
└── skills/
    └── claw-router/SKILL.md
```

---

## 演进 Roadmap

详细开发计划见 [ROADMAP.md](./ROADMAP.md)。

### 最新更新 ✅

**v2.0.1 (Released)**
- ✅ 打破循环依赖，抽取公共数学组件，提高类型安全
- ✅ LRU 缓存修正与跨平台路径修复
- ✅ Anchor 特征向量磁盘缓存机制（大幅加速冷启动）
- ✅ 162 全量测试用例（覆盖极短报错、注入攻击等生产环境边角 case）

**v2.0.0 (Released)**
- ✅ Trait-based 路由机制落地（声明模型擅长点，系统全自动算分派单）
- ✅ 本地大模型语义路由 (Semantic Routing)
- ✅ 多轮历史上下文提权补偿 (Context-Awareness)
- ✅ LLM 多模型冲突仲裁
- ✅ 增加数学与研究任务分类：+math, +research

### 构建中 🚀

- **Learning & Feedback** — 自动记忆你的路由修正建议，纠正未来的特征派发
- **Route Decision Visualization** — 提供精美 Web UI（雷达图、路由趋势图）

---

## 许可证

[AIWare Community License](LICENSE) © aiwaretop
