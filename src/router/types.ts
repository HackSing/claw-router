/**
 * @aiwaretop/claw-router — Type Definitions
 *
 * Core types for the 8-dimension scoring engine and trait-based model routing.
 */

// ── Tier ────────────────────────────────────────────────────────────────────

/** 五级复杂度等级，从简到难。 */
export enum Tier {
  TRIVIAL = 'TRIVIAL',
  SIMPLE = 'SIMPLE',
  MODERATE = 'MODERATE',
  COMPLEX = 'COMPLEX',
  EXPERT = 'EXPERT',
}

/** 有序数组，用于阈值查找。 */
export const TIER_ORDER: Tier[] = [
  Tier.TRIVIAL,
  Tier.SIMPLE,
  Tier.MODERATE,
  Tier.COMPLEX,
  Tier.EXPERT,
];

// ── Task Type ───────────────────────────────────────────────────────────────

/** 任务类型：按场景分类，用于 trait 匹配。 */
export enum TaskType {
  CODING = 'coding',             // 编程、调试、代码生成
  WRITING = 'writing',           // 写作、创作、文案
  CHAT = 'chat',                 // 闲聊、问候、简单问答
  ANALYSIS = 'analysis',         // 分析、推理、研究
  TRANSLATION = 'translation',   // 翻译
  MATH = 'math',                 // 数学、公式、计算
  RESEARCH = 'research',         // 调研、论文、文献
  OTHER = 'other',               // 默认/无法分类
}

// ── Scoring Dimensions ──────────────────────────────────────────────────────

/** 八维评分维度。 */
export enum Dimension {
  REASONING = 'reasoning',
  CODE_TECH = 'codeTech',
  TASK_STEPS = 'taskSteps',
  DOMAIN_EXPERT = 'domainExpert',
  OUTPUT_COMPLEX = 'outputComplex',
  CREATIVITY = 'creativity',
  CONTEXT_DEPEND = 'contextDepend',
  MESSAGE_LENGTH = 'messageLength',
}

/** 各维度默认权重（合计 = 1.0）。 */
export const DEFAULT_WEIGHTS: Record<Dimension, number> = {
  [Dimension.REASONING]: 0.20,
  [Dimension.CODE_TECH]: 0.18,
  [Dimension.TASK_STEPS]: 0.15,
  [Dimension.DOMAIN_EXPERT]: 0.12,
  [Dimension.OUTPUT_COMPLEX]: 0.10,
  [Dimension.CREATIVITY]: 0.10,
  [Dimension.CONTEXT_DEPEND]: 0.08,
  [Dimension.MESSAGE_LENGTH]: 0.07,
};

/** 默认 tier 阈值：[TRIVIAL→SIMPLE, SIMPLE→MODERATE, MODERATE→COMPLEX, COMPLEX→EXPERT] */
export const DEFAULT_THRESHOLDS: [number, number, number, number] = [0.20, 0.42, 0.58, 0.78];

// ── Score Results ───────────────────────────────────────────────────────────

/** 单维度评分（0–1）。 */
export interface DimensionScore {
  dimension: Dimension;
  raw: number;       // 原始分 0–1
  weight: number;    // 有效权重
  weighted: number;  // raw × weight
}

/** 单条消息的完整评分结果。 */
export interface ScoreResult {
  dimensions: DimensionScore[];
  rawSum: number;          // Σ(weighted)，校准前
  calibrated: number;      // sigmoid 校准后，0–1
  tier: Tier;
  overrideApplied?: string; // 触发的硬规则
}

// ── Model Profile ───────────────────────────────────────────────────────────

/** 模型能力声明：用户通过 traits 描述每个模型擅长什么。 */
export interface ModelProfile {
  /** 模型标识，如 "anthropic/claude-sonnet" */
  id: string;
  /**
   * 能力特征列表。
   * 取值范围（固定词表）：
   * - Tier: TRIVIAL, SIMPLE, MODERATE, COMPLEX, EXPERT
   * - TaskType: coding, writing, chat, analysis, translation, math, research, other
   */
  traits: string[];
}

// ── Trait Match ─────────────────────────────────────────────────────────────

/** 单个模型的 trait 匹配结果。 */
export interface TraitMatchResult {
  model: ModelProfile;
  /** 匹配得分：基于 Tier 邻近匹配和 TaskType 精确匹配的加权结果 */
  score: number;
  /** 命中的 traits */
  matchedTraits: string[];
}

// ── Routing ─────────────────────────────────────────────────────────────────

/** 模型选择来源。 */
export type MatchSource = 'trait' | 'llm_arbitration' | 'default';

/** 最终路由决策。 */
export interface RouteDecision {
  tier: Tier;
  taskType: TaskType;
  model: string;
  score: ScoreResult;
  latencyMs: number;
  /** 模型选择来源 */
  matchSource: MatchSource;
  /** 候选模型列表（调试/日志用，最多 top 3） */
  candidates: TraitMatchResult[];
}

// ── Configuration ───────────────────────────────────────────────────────────

/** LLM 评分配置。 */
export interface LlmScoringConfig {
  enabled: boolean;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  apiPath?: string;
}

/** 用户插件配置（所有字段可选，与默认值深度合并）。 */
export interface RouterConfig {
  /** 模型能力声明列表 */
  models?: ModelProfile[];
  thresholds?: [number, number, number, number];
  scoring?: {
    weights?: Partial<Record<Dimension, number>>;
  };
  llmScoring?: LlmScoringConfig;
  logging?: boolean;
  /** 是否开启基于本地模型的语义路由（默认：true） */
  enableSemanticRouting?: boolean;
}

// ── Keyword Entry ───────────────────────────────────────────────────────────

/** 评分引擎使用的关键词/模式条目。 */
export interface KeywordEntry {
  /** 关键词字符串或正则模式。 */
  pattern: string;
  /** 匹配时的权重贡献（0–1）。 */
  weight: number;
  /** 为 true 时 pattern 作为 RegExp 处理。 */
  isRegex?: boolean;
  /** 预编译的正则对象（isRegex=true 时自动填充）。 */
  compiledRegex?: RegExp;
}

/** 按维度组织的关键词表。 */
export type KeywordMap = Record<Dimension, KeywordEntry[]>;

// ── Stats ───────────────────────────────────────────────────────────────────

/** 路由器运行时统计。 */
export interface RouterStats {
  totalRouted: number;
  tierCounts: Record<Tier, number>;
  avgLatencyMs: number;
  overrideCount: number;
}
