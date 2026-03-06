/**
 * @aiwaretop/claw-router — LLM Scorer
 *
 * 两个职责：
 * 1. 消息复杂度评估（边界区间时触发）
 * 2. 多模型冲突仲裁（trait 匹配并列时触发）
 *
 * 实际 LLM 调用由调用方通过回调注入。
 */

import { Tier, type ScoreResult, type DimensionScore, Dimension, DEFAULT_WEIGHTS, type LlmScoringConfig, type TraitMatchResult } from './types';

// ── Types ───────────────────────────────────────────────────────────────────

export interface LlmScoreResult {
  tier: Tier;
  confidence: number;
  reasoning: string;
}

export interface LlmArbitrationResult {
  model: string;
  reasoning: string;
}

// ── Prompt Templates ───────────────────────────────────────────────────────

const SCORE_PROMPT = `你是一个消息复杂度分类器。根据用户消息，判断处理它需要的模型能力等级。

消息：{{message}}

分类标准：
- TRIVIAL: 简单问候、确认、闲聊（如"你好"、"好的"）
- SIMPLE: 简单问答、单一直接任务（如"翻译这个词"、"几点了"）
- MODERATE: 需要组织思考的任务（如写短文、框架对比、多步骤操作）
- COMPLEX: 复杂技术实现、多维度分析、调试（如实现算法+测试、性能优化）
- EXPERT: 高难度架构设计、理论证明、跨领域深度分析

只输出JSON，不要其他内容：
{"tier":"TRIVIAL|SIMPLE|MODERATE|COMPLEX|EXPERT","confidence":0.85,"reasoning":"一句话理由"}`;

const ARBITRATION_PROMPT = `你是一个 AI 模型选择器。根据用户消息，从以下候选模型中选择最合适的一个。

消息：{{message}}

候选模型：
{{candidates}}

选择标准：
1. 消息的核心需求与模型特长的匹配度
2. 任务复杂度与模型能力等级是否匹配
3. 如果需求交叉（如"用代码分析数据"），优先匹配主要任务类型

只输出JSON，不要其他内容：
{"model":"model-id","reasoning":"一句话理由"}`;

// ── Tier 分数映射 ──────────────────────────────────────────────────────────

/** 将 Tier 转换为 calibrated 分数（用于融合时的数值表示） */
const TIER_TO_SCORE: Record<Tier, number> = {
  [Tier.TRIVIAL]: 0.08,
  [Tier.SIMPLE]: 0.28,
  [Tier.MODERATE]: 0.48,
  [Tier.COMPLEX]: 0.65,
  [Tier.EXPERT]: 0.88,
};

// ── LLM Scorer Implementation ─────────────────────────────────────────────

export class LlmScorer {
  private config: LlmScoringConfig;
  private invokeLLM: (model: string, prompt: string) => Promise<string>;

  constructor(
    config: LlmScoringConfig,
    invokeLLM: (model: string, prompt: string) => Promise<string>
  ) {
    this.config = config;
    this.invokeLLM = invokeLLM;
  }

  /**
   * 使用 LLM 评估消息复杂度
   */
  async evaluate(message: string): Promise<LlmScoreResult | null> {
    if (!this.config.enabled) {
      return null;
    }

    try {
      const model = this.config.model || 'default';
      const prompt = SCORE_PROMPT.replace('{{message}}', message);

      const response = await this.invokeLLM(model, prompt);
      return this.parseScoreResponse(response);
    } catch (error) {
      console.error('[claw-router] LLM 评估失败:', error);
      return null;
    }
  }

  /**
   * 使用 LLM 仲裁多个候选模型
   */
  async arbitrate(message: string, candidates: TraitMatchResult[]): Promise<LlmArbitrationResult | null> {
    if (!this.config.enabled) {
      return null;
    }

    try {
      const model = this.config.model || 'default';
      const candidateText = candidates
        .map(c => `- ${c.model.id}: 擅长 [${c.model.traits.join(', ')}]（匹配度 ${(c.score * 100).toFixed(0)}%）`)
        .join('\n');

      const prompt = ARBITRATION_PROMPT
        .replace('{{message}}', message)
        .replace('{{candidates}}', candidateText);

      const response = await this.invokeLLM(model, prompt);
      return this.parseArbitrationResponse(response, candidates);
    } catch (error) {
      console.error('[claw-router] LLM 仲裁失败:', error);
      return null;
    }
  }

  /**
   * 解析复杂度评估响应
   */
  private parseScoreResponse(response: string): LlmScoreResult | null {
    try {
      const jsonMatch = response.match(/\{[\s\S]*?\}/);
      if (!jsonMatch) return null;

      const parsed = JSON.parse(jsonMatch[0]);
      return {
        tier: this.parseTier(parsed.tier),
        confidence: Math.min(Math.max(parsed.confidence || 0.5, 0), 1),
        reasoning: parsed.reasoning || '',
      };
    } catch (error) {
      console.error('[claw-router] 解析 LLM 评估响应失败:', error);
      return null;
    }
  }

  /**
   * 解析仲裁响应
   */
  private parseArbitrationResponse(response: string, candidates: TraitMatchResult[]): LlmArbitrationResult | null {
    try {
      const jsonMatch = response.match(/\{[\s\S]*?\}/);
      if (!jsonMatch) return null;

      const parsed = JSON.parse(jsonMatch[0]);
      const modelId = parsed.model || '';

      // 验证 LLM 返回的 model ID 是否在候选列表中
      const valid = candidates.some(c => c.model.id === modelId);
      if (!valid) return null;

      return {
        model: modelId,
        reasoning: parsed.reasoning || '',
      };
    } catch (error) {
      console.error('[claw-router] 解析 LLM 仲裁响应失败:', error);
      return null;
    }
  }

  /**
   * 解析 tier 字符串为枚举值
   */
  private parseTier(tierStr: string): Tier {
    const normalized = tierStr.toUpperCase().trim();
    switch (normalized) {
      case 'TRIVIAL': return Tier.TRIVIAL;
      case 'SIMPLE': return Tier.SIMPLE;
      case 'MODERATE': return Tier.MODERATE;
      case 'COMPLEX': return Tier.COMPLEX;
      case 'EXPERT': return Tier.EXPERT;
      default: return Tier.SIMPLE;
    }
  }

  /**
   * 将 LLM 分类结果转换为 ScoreResult 格式（用于融合）
   */
  convertToScoreResult(llmResult: LlmScoreResult): ScoreResult {
    const calibrated = TIER_TO_SCORE[llmResult.tier] ?? 0.28;

    const dimensions: DimensionScore[] = Object.values(Dimension).map((dim) => ({
      dimension: dim as Dimension,
      raw: 0,
      weight: DEFAULT_WEIGHTS[dim as Dimension] || 0,
      weighted: 0,
    }));

    return {
      dimensions,
      rawSum: calibrated,
      calibrated,
      tier: llmResult.tier,
      overrideApplied: 'llm_classification',
    };
  }
}
