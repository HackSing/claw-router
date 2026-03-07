/**
 * @aiwaretop/claw-router — Shared Semantic Signals
 *
 * 收敛技术语义与任务意图判断，供 overrides / engine / classifier / scorer 复用。
 * Phase 1 先落最小可用版本，优先统一 tech/review/analysis/chat 等高频信号。
 */

export interface SemanticContext {
  message: string;
  lower: string;
  compact: string;
  length: number;
  hasCodeFence: boolean;
}

export interface SemanticSignals {
  techContext: number;
  codeArtifact: number;
  implementationIntent: number;
  reviewIntent: number;
  analysisIntent: number;
  writingIntent: number;
  translationIntent: number;
  mathIntent: number;
  researchIntent: number;
  chatIntent: number;
  contextDependency: number;
  reasoningIntent: number;
  multiStepIntent: number;
  architectureIntent: number;
}

const TECH_PATTERNS: RegExp[] = [
  /\b(?:python|javascript|typescript|java|rust|golang|go|node|react|vue|docker|kubernetes|sql|css|html|json|yaml|xml|api|sdk|cli|repo|router|plugin|debug|bug|git|npm|pip|ssh)\b/i,
  /(?:代码|编程|函数|脚本|接口|模块|组件|仓库|插件|实现|重构|调试|部署|编译|数据库|算法|日志)/i,
  /\b(?:ts|js)\b/i,
];

const CODE_ARTIFACT_PATTERNS: RegExp[] = [
  /(?:代码|函数|类|脚本|接口|模块|组件|仓库|插件|实现|文件)/i,
  /```[\s\S]*?```/,
  /\b(?:import|export|class|const|let|var|def|function)\b/i,
  /\.(?:py|js|ts|jsx|tsx|java|go|rs|sql|json|yaml|yml|toml|md)\b/i,
];

const IMPLEMENTATION_PATTERNS: RegExp[] = [
  /(?:写个|写一|帮我写|实现|开发|重构|修复|修一下|改一下|补测试|加一个|新增|删除|生成 patch|改代码|写代码)/i,
  /\b(?:implement|build|create|refactor|fix|patch|add|remove|write)\b/i,
];

const REVIEW_PATTERNS: RegExp[] = [
  /(?:代码审查|代码评审|看下代码|看看代码|审一下|审查实现|优化空间|可优化|哪里可以优化|还有哪些问题|边界问题|风险点)/i,
  /\b(?:review|review code|code review|audit|optimi[sz]e)\b/i,
];

const ANALYSIS_PATTERNS: RegExp[] = [
  /(?:分析|评估|比较|对比|解释|原因|为什么|利弊|优缺点|权衡|适用边界|策略|方案)/i,
  /\b(?:analyze|analysis|evaluate|compare|explain|why|trade-off|pros and cons|strategy)\b/i,
];

const ARCHITECTURE_PATTERNS: RegExp[] = [
  /(?:系统设计|架构设计|整体架构|技术方案设计|多租户|高并发|分布式|从零搭建)/i,
  /\b(?:system design|architecture design|design a system|build from scratch|distributed)\b/i,
];

const WRITING_PATTERNS: RegExp[] = [
  /(?:写一篇|写文章|写文案|写博客|写邮件|写故事|创作|起标题)/i,
  /\b(?:write an article|write a blog|draft|compose|story|copywriting)\b/i,
];

const TRANSLATION_PATTERNS: RegExp[] = [
  /(?:翻译|译成|翻成|中译英|英译中)/i,
  /\b(?:translate|translation|translate to)\b/i,
];

const MATH_PATTERNS: RegExp[] = [
  /(?:数学|方程|公式|微积分|概率|矩阵|向量|证明|定理)/i,
  /\b(?:math|equation|formula|calculus|probability|matrix|vector|proof)\b/i,
];

const RESEARCH_PATTERNS: RegExp[] = [
  /(?:调研|论文|文献|综述|期刊|学术|参考文献|研究方法)/i,
  /\b(?:paper|literature|survey|academic|journal|citation|methodology)\b/i,
];

const CHAT_PATTERNS: RegExp[] = [
  /^(?:你好|嗨|hello|hi|hey|在吗|好的?|行|收到|谢谢|再见)$/i,
  /(?:重启成功了|我继续跑下|先这样|好，我们继续|收到|辛苦了)/i,
];

const CONTEXT_PATTERNS: RegExp[] = [
  /(?:上面|上述|前面|刚才|前文|继续|接着|还是那个|基于刚刚|按前面的)/i,
  /\b(?:continue|based on the above|previous|earlier|that one)\b/i,
];

const REASONING_PATTERNS: RegExp[] = [
  /(?:为什么|原因|比较|对比|如果|假设|权衡|利弊|边界|是否合理)/i,
  /\b(?:why|compare|if|assuming|trade-off|because|therefore|boundary)\b/i,
];

const MULTI_STEP_PATTERNS: RegExp[] = [
  /(?:首先|然后|接着|最后|分步骤|实施方案|任务清单|验证方法|完整|从零开始|全流程)/i,
  /\b(?:first|then|finally|step by step|plan|checklist|validation|end to end)\b/i,
];

function scoreByPatterns(input: string, patterns: RegExp[], strongBoost = 0.55, weakBoost = 0.25): number {
  let score = 0;
  for (let i = 0; i < patterns.length; i++) {
    if (patterns[i].test(input)) {
      score = Math.max(score, i === 0 ? strongBoost : weakBoost);
    }
  }
  return clamp(score);
}

function clamp(v: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, v));
}

export function buildSemanticContext(message: string): SemanticContext {
  return {
    message,
    lower: message.toLowerCase(),
    compact: message.replace(/\s+/g, ' ').trim(),
    length: message.length,
    hasCodeFence: /```[\s\S]*?```/.test(message),
  };
}

export function extractSemanticSignals(message: string): SemanticSignals {
  const ctx = buildSemanticContext(message);
  const { lower, compact, hasCodeFence } = ctx;

  const techContext = clamp(
    scoreByPatterns(lower, TECH_PATTERNS, 0.65, 0.35) + (hasCodeFence ? 0.25 : 0),
  );

  const codeArtifact = clamp(
    scoreByPatterns(message, CODE_ARTIFACT_PATTERNS, 0.70, 0.35) + (hasCodeFence ? 0.20 : 0),
  );

  const implementationIntent = scoreByPatterns(lower, IMPLEMENTATION_PATTERNS, 0.65, 0.35);
  const reviewIntent = scoreByPatterns(lower, REVIEW_PATTERNS, 0.75, 0.40);
  const analysisIntent = scoreByPatterns(lower, ANALYSIS_PATTERNS, 0.60, 0.30);
  const architectureIntent = scoreByPatterns(lower, ARCHITECTURE_PATTERNS, 0.85, 0.45);
  const writingIntent = scoreByPatterns(lower, WRITING_PATTERNS, 0.70, 0.35);
  const translationIntent = scoreByPatterns(lower, TRANSLATION_PATTERNS, 0.90, 0.45);
  const mathIntent = scoreByPatterns(lower, MATH_PATTERNS, 0.75, 0.35);
  const researchIntent = scoreByPatterns(lower, RESEARCH_PATTERNS, 0.75, 0.35);
  const contextDependency = scoreByPatterns(lower, CONTEXT_PATTERNS, 0.55, 0.30);
  const reasoningIntent = clamp(scoreByPatterns(lower, REASONING_PATTERNS, 0.55, 0.25) + ((compact.match(/[？?]/g) || []).length >= 2 ? 0.1 : 0));
  const multiStepIntent = clamp(scoreByPatterns(lower, MULTI_STEP_PATTERNS, 0.60, 0.30) + ((compact.match(/[，、；,]/g) || []).length >= 2 ? 0.1 : 0));

  let chatIntent = scoreByPatterns(compact, CHAT_PATTERNS, 0.80, 0.35);
  if (compact.length <= 12 && techContext < 0.2 && reviewIntent < 0.2 && implementationIntent < 0.2) {
    chatIntent = Math.max(chatIntent, 0.45);
  }

  const dampedWritingIntent = techContext >= 0.45 && implementationIntent >= 0.35
    ? writingIntent * 0.2
    : writingIntent;

  return {
    techContext,
    codeArtifact,
    implementationIntent,
    reviewIntent,
    analysisIntent,
    writingIntent: clamp(dampedWritingIntent),
    translationIntent,
    mathIntent,
    researchIntent,
    chatIntent,
    contextDependency,
    reasoningIntent,
    multiStepIntent,
    architectureIntent,
  };
}
