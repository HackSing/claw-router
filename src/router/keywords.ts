/**
 * @aiwaretop/claw-router — Bilingual Keyword Library
 *
 * Chinese + English keywords organised by the 8 scoring dimensions.
 * Each entry carries its own weight so the scorer can compute
 * per-dimension scores with a single pass over the message.
 *
 * Conventions:
 *   - `isRegex: true`  → pattern is a RegExp source (case-insensitive)
 *   - otherwise         → plain substring match (case-insensitive for Latin)
 */

import { Dimension, type KeywordEntry, type KeywordMap } from './types';

// ── helpers ─────────────────────────────────────────────────────────────────

const kw = (pattern: string, weight: number, isRegex = false): KeywordEntry => ({
  pattern,
  weight,
  ...(isRegex ? { isRegex } : {}),
});

// ── 1 · Reasoning Depth ────────────────────────────────────────────────────

const reasoning: KeywordEntry[] = [
  // Chinese
  kw('为什么',   0.40),
  kw('原因',     0.35),
  kw('分析',     0.55),
  kw('推理',     0.65),
  kw('证明',     0.75),
  kw('逻辑',     0.60),
  kw('因果',     0.55),
  kw('论证',     0.65),
  kw('假设',     0.50),
  kw('归纳',     0.60),
  kw('演绎',     0.65),
  kw('悖论',     0.75),
  kw('矛盾',     0.45),
  kw('权衡',     0.50),
  kw('利弊',     0.45),
  kw('深入分析',  0.70),
  kw('根本原因',  0.60),
  kw('底层逻辑',  0.65),
  kw('推导',     0.65),
  kw('核心',     0.30),
  kw('原理',     0.40),
  kw('本质',     0.40),
  kw('影响',     0.25),
  kw('趋势',     0.30),
  kw('发展',     0.20),
  // English
  kw('why',          0.35),
  kw('because',      0.20),
  kw('analyze',      0.55),
  kw('analysis',     0.50),
  kw('reasoning',    0.65),
  kw('prove',        0.70),
  kw('proof',        0.75),
  kw('logic',        0.55),
  kw('deduce',       0.65),
  kw('infer',        0.60),
  kw('hypothesis',   0.55),
  kw('trade-off',    0.50),
  kw('root cause',   0.60),
  kw('think step by step', 0.75),
  kw('chain of thought',   0.75),
  kw('pros and cons',      0.45),
  kw('implications', 0.50),
  kw('undecidable',  0.70),
  kw('theorem',      0.65),
  kw('generalization', 0.45),
  kw('diagonalization', 0.70),
];

// ── 2 · Code / Tech ────────────────────────────────────────────────────────

const codeTech: KeywordEntry[] = [
  // Chinese
  kw('代码',     0.55),
  kw('编程',     0.60),
  kw('函数',     0.50),
  kw('算法',     0.65),
  kw('调试',     0.60),
  kw('debug',    0.60),
  kw('报错',     0.55),
  kw('bug',      0.55),
  kw('接口',     0.45),
  kw('数据库',   0.50),
  kw('部署',     0.55),
  kw('重构',     0.60),
  kw('性能优化', 0.60),
  kw('并发',     0.60),
  kw('异步',     0.50),
  kw('编译',     0.50),
  kw('脚本',     0.45),
  kw('开源',     0.30),
  kw('爬虫',     0.55),
  kw('排序',     0.45),
  kw('实现',     0.35),
  kw('组件',     0.40),
  kw('框架',     0.40),
  kw('拖拽',     0.40),
  kw('触摸',     0.30),
  // English
  kw('function',    0.45),
  kw('algorithm',   0.65),
  kw('refactor',    0.60),
  kw('deploy',      0.55),
  kw('compile',     0.50),
  kw('runtime',     0.45),
  kw('async',       0.50),
  kw('concurrency', 0.60),
  kw('concurrent',  0.55),
  kw('database',    0.50),
  kw('API',         0.45),
  kw('REST',        0.40),
  kw('GraphQL',     0.50),
  kw('Docker',      0.50),
  kw('Kubernetes',  0.60),
  kw('CI/CD',       0.55),
  kw('pipeline',    0.45),
  kw('microservice', 0.60),
  kw('SQL',         0.45),
  kw('TypeScript',  0.45),
  kw('Python',      0.40),
  kw('Rust',        0.45),
  kw('JavaScript',  0.40),
  kw('implement',   0.45),
  kw('unit test',   0.50),
  kw('binary search', 0.55),
  kw('rate limit',  0.50),
  kw('token bucket', 0.55),
  kw('locking',     0.45),
  // regex: code fences
  kw('```',         0.60),
  kw('import ',     0.40),
  kw('const ',      0.35),
  kw('def ',        0.40),
  kw('class ',      0.40),
  kw('\\bfn\\b',    0.40, true),
  kw('\\b(let|var)\\s', 0.30, true),
];

// ── 3 · Task Steps ─────────────────────────────────────────────────────────

const taskSteps: KeywordEntry[] = [
  // Chinese
  kw('第一步',   0.55),
  kw('步骤',     0.55),
  kw('首先',     0.45),
  kw('然后',     0.40),
  kw('接着',     0.40),
  kw('最后',     0.40),
  kw('分步',     0.60),
  kw('依次',     0.50),
  kw('流程',     0.50),
  kw('按照顺序', 0.55),
  kw('逐步',     0.55),
  kw('一步一步', 0.60),
  kw('需要',     0.25),
  kw('包括',     0.25),
  kw('支持',     0.20),
  kw('处理',     0.25),
  kw('先.*再.*然后', 0.65, true),
  // English
  kw('step by step', 0.60),
  kw('first',        0.25),
  kw('then',         0.25),
  kw('finally',      0.30),
  kw('workflow',     0.55),
  kw('procedure',    0.50),
  kw('instructions', 0.45),
  kw('including',    0.20),
  kw('supporting',   0.20),
  kw('with proper',  0.30),
  kw('\\bstep\\s*\\d', 0.60, true),
  kw('1\\.',         0.35),
  kw('2\\.',         0.30),
  kw('\\d+\\)\\s',   0.35, true),
];

// ── 4 · Domain Expertise ───────────────────────────────────────────────────

const domainExpert: KeywordEntry[] = [
  // Chinese — Medicine
  kw('诊断',     0.60),
  kw('病理',     0.65),
  kw('处方',     0.60),
  // Chinese — Law
  kw('法律',     0.55),
  kw('诉讼',     0.60),
  kw('合规',     0.55),
  kw('条款',     0.45),
  // Chinese — Finance
  kw('财报',     0.55),
  kw('估值',     0.60),
  kw('对冲',     0.60),
  kw('期权',     0.60),
  kw('量化',     0.55),
  // Chinese — Science
  kw('量子',     0.65),
  kw('拓扑',     0.70),
  kw('微分方程', 0.70),
  kw('神经网络', 0.60),
  kw('机器学习', 0.55),
  kw('深度学习', 0.60),
  kw('人工智能', 0.40),
  kw('加密',     0.45),
  kw('密码学',   0.55),
  kw('算法',     0.40),
  kw('分布式',   0.50),
  kw('高并发',   0.50),
  kw('威胁',     0.25),
  kw('替代方案', 0.35),
  // English
  kw('diagnosis',     0.60),
  kw('pathology',     0.65),
  kw('litigation',    0.60),
  kw('compliance',    0.55),
  kw('valuation',     0.60),
  kw('derivative',    0.55),
  kw('quantitative',  0.55),
  kw('neural network', 0.60),
  kw('machine learning', 0.55),
  kw('deep learning', 0.60),
  kw('quantum',       0.65),
  kw('topology',      0.70),
  kw('differential equation', 0.70),
  kw('reinforcement learning', 0.65),
  kw('transformer',   0.50),
  kw('attention mechanism', 0.60),
  kw('encryption',    0.45),
  kw('cryptography',  0.55),
  kw('static program analysis', 0.60),
  kw('halting problem', 0.70),
  kw('decidable',     0.60),
  kw('computability',  0.65),
];

// ── 5 · Output Complexity ──────────────────────────────────────────────────

const outputComplex: KeywordEntry[] = [
  // Chinese
  kw('表格',       0.55),
  kw('JSON',       0.50),
  kw('格式',       0.40),
  kw('模板',       0.45),
  kw('结构化',     0.60),
  kw('Markdown',   0.45),
  kw('报告',       0.50),
  kw('文档',       0.40),
  kw('大纲',       0.45),
  kw('输出格式',   0.55),
  kw('排版',       0.40),
  kw('字左右',     0.30),
  kw('保存为',     0.40),
  kw('输出',       0.25),
  kw('列出',       0.30),
  // English
  kw('table',      0.50),
  kw('JSON',       0.50),
  kw('format',     0.35),
  kw('template',   0.45),
  kw('structured', 0.60),
  kw('markdown',   0.45),
  kw('report',     0.45),
  kw('outline',    0.45),
  kw('schema',     0.55),
  kw('YAML',       0.50),
  kw('CSV',        0.45),
  kw('XML',        0.45),
  kw('listing',    0.30),
  kw('list the',   0.30),
  kw('output',     0.25),
];

// ── 6 · Creativity ─────────────────────────────────────────────────────────

const creativity: KeywordEntry[] = [
  // Chinese
  kw('写一篇',     0.55),
  kw('写一个',     0.40),
  kw('帮我写',     0.50),
  kw('创作',       0.55),
  kw('故事',       0.50),
  kw('小说',       0.55),
  kw('诗',         0.55),
  kw('文案',       0.50),
  kw('广告语',     0.45),
  kw('slogan',     0.40),
  kw('取名',       0.40),
  kw('起名',       0.40),
  kw('想象',       0.45),
  kw('脑洞',       0.50),
  kw('改写',       0.45),
  kw('续写',       0.50),
  kw('仿写',       0.50),
  kw('风格',       0.30),
  kw('短文',       0.45),
  kw('文章',       0.40),
  kw('作文',       0.45),
  kw('稿',         0.35),
  kw('撰写',       0.50),
  // English
  kw('write a',    0.45),
  kw('write an',   0.45),
  kw('compose',    0.50),
  kw('story',      0.50),
  kw('poem',       0.55),
  kw('creative',   0.50),
  kw('fiction',    0.55),
  kw('brainstorm', 0.50),
  kw('imagine',    0.45),
  kw('rewrite',    0.45),
  kw('narrative',  0.50),
  kw('essay',      0.45),
  kw('blog post',  0.45),
  kw('article',    0.40),
  kw('draft',      0.35),
];

// ── 7 · Context Dependency ─────────────────────────────────────────────────

const contextDepend: KeywordEntry[] = [
  // Chinese
  kw('上面',       0.40),
  kw('刚才',       0.40),
  kw('之前',       0.35),
  kw('前面提到',   0.50),
  kw('上文',       0.50),
  kw('你说的',     0.45),
  kw('接上面',     0.50),
  kw('继续',       0.35),
  kw('上一条',     0.50),
  kw('基于此',     0.45),
  kw('综合以上',   0.55),
  // English
  kw('above',        0.30),
  kw('previously',   0.40),
  kw('as mentioned', 0.50),
  kw('continue',     0.30),
  kw('follow up',    0.40),
  kw('based on',     0.35),
  kw('in context',   0.45),
  kw('referring to',  0.45),
  kw('earlier',      0.35),
  kw('the previous', 0.45),
];

// ── 8 · Message Length (handled numerically — but these are complexity cues)

const messageLength: KeywordEntry[] = [
  // These are not keyword matches — length is scored numerically in scorer.ts.
  // We keep this array empty; the dimension weight still applies via numeric scoring.
];

// ── Export ───────────────────────────────────────────────────────────────────

export const KEYWORDS: KeywordMap = {
  [Dimension.REASONING]:       reasoning,
  [Dimension.CODE_TECH]:       codeTech,
  [Dimension.TASK_STEPS]:      taskSteps,
  [Dimension.DOMAIN_EXPERT]:   domainExpert,
  [Dimension.OUTPUT_COMPLEX]:  outputComplex,
  [Dimension.CREATIVITY]:      creativity,
  [Dimension.CONTEXT_DEPEND]:  contextDepend,
  [Dimension.MESSAGE_LENGTH]:  messageLength,
};
