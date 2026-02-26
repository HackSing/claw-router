/**
 * @aiwaretop/claw-router — LLM Scorer
 *
 * Uses LLM to evaluate message complexity when rules are uncertain.
 * The actual LLM invocation is provided by the caller via a callback.
 */

import { Tier, type ScoreResult, type DimensionScore, Dimension, DEFAULT_WEIGHTS } from './types';
import { LlmCache } from './cache';

// ── Types ───────────────────────────────────────────────────────────────────

export interface LlmScoreResult {
  tier: Tier;
  confidence: number;
  reasoning: string;
  dimensions: Record<string, number>;
}

export interface LlmScoringConfig {
  enabled: boolean;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  fallbackModel?: string;
  highSpeedMode?: boolean;
  cache?: {
    enabled: boolean;
    maxEntries?: number;
  };
  invokeLLM?: (model: string, prompt: string) => Promise<string>;
}

// ── Prompt Template ────────────────────────────────────────────────────────

const SCORE_PROMPT = `你是一个消息复杂度分类器。根据用户消息，判断其复杂度等级。

消息：{{message}}

请从以下维度评分（0-1）：
1. reasoning - 需要推理/分析的程度
2. codeTech - 代码/技术相关程度
3. taskSteps - 任务步骤多少
4. domainExpert - 需要专业知识程度
5. outputComplex - 输出复杂程度
6. creativity - 创意/创作程度
7. contextDepend - 依赖上下文程度
8. messageLength - 消息长度

最终分类：
- TRIVIAL: 简单问候、日常闲聊
- SIMPLE: 简单问答、单一任务
- MODERATE: 需要思考、多步骤任务
- COMPLEX: 复杂技术问题、多维度分析
- EXPERT: 高难度架构设计、深度技术问题

输出JSON格式：
{
  "tier": "TRIVIAL|SIMPLE|MODERATE|COMPLEX|EXPERT",
  "confidence": 0.85,
  "reasoning": "简短判断理由",
  "dimensions": {
    "reasoning": 0.3,
    "codeTech": 0.8,
    "taskSteps": 0.5,
    "domainExpert": 0.2,
    "outputComplex": 0.4,
    "creativity": 0.1,
    "contextDepend": 0.3,
    "messageLength": 0.2
  }
}`;

// ── LLM Scorer Implementation ─────────────────────────────────────────────

export class LlmScorer {
  private cache: LlmCache | null = null;
  private config: LlmScoringConfig;
  private invokeLLM: (model: string, prompt: string) => Promise<string>;

  constructor(
    config: LlmScoringConfig, 
    invokeLLM: (model: string, prompt: string) => Promise<string>
  ) {
    this.config = config;
    this.invokeLLM = invokeLLM;
    
    if (config.cache?.enabled !== false) {
      this.cache = new LlmCache(config.cache);
    }
  }

  /**
   * Evaluate message complexity using LLM
   */
  async evaluate(message: string): Promise<LlmScoreResult | null> {
    if (!this.config.enabled) {
      return null;
    }

    // Check cache first
    if (this.cache) {
      const cached = this.cache.get(message);
      if (cached) {
        return {
          tier: cached.tier,
          confidence: cached.confidence,
          reasoning: cached.reasoning,
          dimensions: cached.dimensions,
        };
      }
    }

    // Call LLM API via callback
    try {
      const model = this.config.model || 'default';
      const prompt = SCORE_PROMPT.replace('{{message}}', message);
      
      const response = await this.invokeLLM(model, prompt);
      const result = this.parseResponse(response);
      
      // Store in cache
      if (this.cache && result) {
        this.cache.set(message, {
          tier: result.tier,
          confidence: result.confidence,
          reasoning: result.reasoning,
          dimensions: result.dimensions,
        });
      }
      
      return result;
    } catch (error) {
      console.error('[claw-router] LLM evaluation failed:', error);
      return null;
    }
  }

  /**
   * Parse LLM response to LlmScoreResult
   */
  private parseResponse(response: string): LlmScoreResult | null {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return null;
      }
      
      const parsed = JSON.parse(jsonMatch[0]);
      
      return {
        tier: this.parseTier(parsed.tier),
        confidence: parsed.confidence || 0.5,
        reasoning: parsed.reasoning || '',
        dimensions: parsed.dimensions || {},
      };
    } catch (error) {
      console.error('[claw-router] Failed to parse LLM response:', error);
      return null;
    }
  }

  /**
   * Parse tier string to Tier enum
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
   * Convert LLM result to ScoreResult format
   */
  convertToScoreResult(llmResult: LlmScoreResult): ScoreResult {
    const dimensions: DimensionScore[] = Object.entries(Dimension).map(([key, dim]) => ({
      dimension: dim as Dimension,
      raw: llmResult.dimensions[key.toLowerCase()] || 0,
      weight: DEFAULT_WEIGHTS[dim as Dimension] || 0,
      weighted: (llmResult.dimensions[key.toLowerCase()] || 0) * (DEFAULT_WEIGHTS[dim as Dimension] || 0),
    }));

    const rawSum = dimensions.reduce((sum, d) => sum + d.weighted, 0);
    const calibrated = Math.min(rawSum / 0.5, 1);

    return {
      dimensions,
      rawSum,
      calibrated,
      tier: llmResult.tier,
      overrideApplied: 'llm_evaluation',
    };
  }
}
