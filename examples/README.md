# Claw Router 配置示例 📁

本目录包含可以直接复制使用的配置文件样板，帮助你快速完成 Claw Router 插件的配置。

## 文件内容说明

### `openclaw-config-example.json`
这是一个完整且建议的「**小杯 - 中杯 - 大杯**」三档模型分类配置样例。

- **小杯模型 (`gpt-4o-mini` 或其他快速模型)**：
  - 处理 `chat` (日常聊天), `translation` (短文翻译)
  - 承接 `TRIVIAL` (极简), `SIMPLE` (简单) 的任务
- **中杯模型 (`gemini-pro` 或其他均衡模型)**：
  - 处理 `writing` (文案写作), `research` (资料调研)
  - 承接 `MODERATE` (中等) 难度的任务
- **大杯模型 (`claude-3.5-sonnet` 或其他推理与代码最强模型)**：
  - 处理 `coding` (代码编写), `math` (数学计算), `analysis` (长文分析)
  - 承接 `COMPLEX` (复杂), `EXPERT` (专家级) 的任务

除此之外，这个配置文件还演示了：
- 如何开启 `enableSemanticRouting` (本地语义引擎拦截，零成本) 
- 如何开启 `logging` (记录详细决策日志)
- 怎样配置但暂未开启 `llmScoring` (LLM 做高阶仲裁的分流裁判设定)

### 如何使用？

1. 找到你的 OpenClaw 配置文件，通常位于 `~/.openclaw/openclaw.json` (Windows: `C:\Users\YourUser\.openclaw\openclaw.json`)
2. 将本目录下的 JSON 内容片段复制到你的主配置文件中的 `plugins` 节点下。
3. 请确保把你配置模型 ID (`id`) 替换为你已经在主程序配好 API Keys 中真实存在的模型名称。
