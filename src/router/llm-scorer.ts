/**
 * @aiwaretop/claw-router — LLM Scorer
 *
 * 使用 LLM 作为分类器评估消息复杂度。
 * LLM 只返回 tier + confidence + reasoning，不做维度打分。
 * 实际 LLM 调用由调用方通过回调注入。
 */

import { Tier, type ScoreResult, type DimensionScore, Dimension, DEFAULT_WEIGHTS, type LlmScoringConfig } from './types';

// ── Types ───────────────────────────────────────────────────────────────────

export interface LlmScoreResult {
  tier: Tier;
  confidence: number;
  reasoning: string;
}

// ── Prompt Template ────────────────────────────────────────────────────────

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
      return this.parseResponse(response);
    } catch (error) {
      console.error('[claw-router] LLM 评估失败:', error);
      return null;
    }
  }

  /**
   * 解析 LLM 响应
   */
  private parseResponse(response: string): LlmScoreResult | null {
    try {
      // 非贪婪匹配，避免多个 JSON 块时匹配错误
      const jsonMatch = response.match(/\{[\s\S]*?\}/);
      if (!jsonMatch) {
        return null;
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        tier: this.parseTier(parsed.tier),
        confidence: Math.min(Math.max(parsed.confidence || 0.5, 0), 1),
        reasoning: parsed.reasoning || '',
      };
    } catch (error) {
      console.error('[claw-router] 解析 LLM 响应失败:', error);
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
