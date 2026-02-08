/**
 * @aiwaretop/claw-router — 8-Dimension Scorer
 *
 * Pure-local, zero-dependency scorer that runs in < 1 ms.
 * Each dimension produces a 0–1 score using keyword matching
 * (substring + regex), structural analysis, and numeric heuristics.
 */

import { Dimension, DEFAULT_WEIGHTS, type DimensionScore } from './types';
import { KEYWORDS } from './keywords';
import type { KeywordEntry } from './types';

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Score a message across all 8 dimensions.
 *
 * @param message  Raw user message
 * @param weights  Effective weight map (already merged with defaults)
 * @returns        Array of 8 DimensionScore objects
 */
export function scoreDimensions(
  message: string,
  weights: Record<Dimension, number> = DEFAULT_WEIGHTS,
): DimensionScore[] {
  const lower = message.toLowerCase();

  return Object.values(Dimension).map((dim) => {
    let raw: number;
    switch (dim) {
      case Dimension.MESSAGE_LENGTH:
        raw = scoreLength(message);
        break;
      case Dimension.TASK_STEPS:
        raw = Math.max(
          scoreKeywords(lower, KEYWORDS[dim]),
          scoreStructuralSteps(message),
        );
        break;
      case Dimension.CONTEXT_DEPEND:
        raw = Math.max(
          scoreKeywords(lower, KEYWORDS[dim]),
          scoreContextSignals(lower),
        );
        break;
      case Dimension.CREATIVITY:
        // Boost creativity with task-request detection
        raw = Math.max(
          scoreKeywords(lower, KEYWORDS[dim]),
          scoreCreativeRequest(lower),
        );
        break;
      default:
        raw = scoreKeywords(lower, KEYWORDS[dim]);
    }

    // Add structural complexity bonus for dimensions that benefit from it
    if (dim === Dimension.REASONING) {
      raw = Math.max(raw, scoreReasoningStructure(lower));
    }

    const weight = weights[dim] ?? DEFAULT_WEIGHTS[dim];
    return {
      dimension: dim,
      raw: clamp(raw),
      weight,
      weighted: clamp(raw) * weight,
    };
  });
}

// ── Keyword-based scoring ───────────────────────────────────────────────────

/**
 * Aggregate keyword matches for a single dimension.
 *
 * Using a "soft max" approach: score = 1 - ∏(1 - wᵢ) for each match i,
 * which naturally saturates towards 1 without hard-clipping.
 */
function scoreKeywords(lowerMsg: string, entries: KeywordEntry[]): number {
  let complement = 1.0;

  for (const entry of entries) {
    const matched = entry.isRegex
      ? new RegExp(entry.pattern, 'i').test(lowerMsg)
      : lowerMsg.includes(entry.pattern.toLowerCase());

    if (matched) {
      complement *= (1 - entry.weight);
    }
  }

  return 1 - complement;
}

// ── Structural / heuristic scorers ──────────────────────────────────────────

/**
 * Detect multi-step structure from punctuation, numbering, connectives.
 * Works for both Chinese and English.
 */
function scoreStructuralSteps(message: string): number {
  let score = 0;

  // Count Chinese comma-separated clauses (、or ，)
  const chineseCommas = (message.match(/[，、；]/g) || []).length;
  if (chineseCommas >= 3) score += 0.3;
  else if (chineseCommas >= 1) score += 0.15;

  // Count English commas
  const englishCommas = (message.match(/,/g) || []).length;
  if (englishCommas >= 3) score += 0.2;

  // Numbered lists (1. 2. or 1) 2) etc.)
  const numberedItems = (message.match(/(?:^|\n)\s*\d+[.)]/gm) || []).length;
  if (numberedItems >= 2) score += 0.4;

  // Multiple sentences (Chinese periods or English periods)
  const sentences = (message.match(/[。！？.!?]/g) || []).length;
  if (sentences >= 3) score += 0.25;

  // Bullet points
  const bullets = (message.match(/(?:^|\n)\s*[-*•]/gm) || []).length;
  if (bullets >= 2) score += 0.3;

  return clamp(score);
}

/**
 * Detect reasoning complexity from question structure and connectives.
 */
function scoreReasoningStructure(lower: string): number {
  let score = 0;

  // Basic question presence (Chinese or English question marks)
  const qmarks = (lower.match(/[？?]/g) || []).length;
  if (qmarks >= 3) score += 0.40;
  else if (qmarks >= 2) score += 0.25;
  else if (qmarks >= 1) score += 0.10;  // single question → mild signal

  // Chinese question words that signal inquiry — but mild for simple questions
  if (/怎么样|什么|怎么|如何|哪个|哪些|多少|几个|是否|能否|可以吗/i.test(lower)) score += 0.10;

  // English simple question words — mild
  if (/\b(what|how|which|where|when|who)\b/i.test(lower)) score += 0.08;

  // Conditional language → moderate reasoning
  if (/如果|假如|假设|若是|if\s|suppose|assuming|given\sthat/i.test(lower)) score += 0.25;

  // Comparative language → moderate reasoning
  if (/比较|对比|区别|差异|优缺点|versus|vs\.?|compared?\sto|differ/i.test(lower)) score += 0.30;

  // Causal connectives → moderate reasoning
  if (/因为|所以|导致|由于|因此|therefore|because|hence|thus|consequently/i.test(lower)) score += 0.25;

  // Request patterns (Chinese) — very mild signal
  if (/帮我|请|麻烦/i.test(lower)) score += 0.05;

  return clamp(score);
}

/**
 * Detect context dependency from pronouns and references.
 */
function scoreContextSignals(lower: string): number {
  let score = 0;

  // Pronoun references to prior content
  if (/这个|那个|它|this|that|these|those|it\s/i.test(lower)) score += 0.2;

  // "the above" / "上面的" patterns
  if (/上面|上述|前述|上文|aforementioned|the\s+above/i.test(lower)) score += 0.4;

  return clamp(score);
}

/**
 * Detect creative/writing requests from structural patterns.
 */
function scoreCreativeRequest(lower: string): number {
  let score = 0;

  // Chinese writing requests
  if (/帮我写|写一[篇个首段]|帮我创作|帮我起名/i.test(lower)) score += 0.40;

  // "关于...的" pattern indicates topical writing
  if (/关于.{2,}的/i.test(lower)) score += 0.25;

  // English writing requests
  if (/write\s+(a|an|me|the)\b/i.test(lower)) score += 0.35;

  // Length/word count specification → content creation
  if (/\d+\s*字|字左右|\d+\s*words?/i.test(lower)) score += 0.20;

  return clamp(score);
}

// ── Length-based scoring ────────────────────────────────────────────────────

/**
 * Map message character count to a 0–1 complexity signal.
 *
 * Piecewise linear:
 *   0–10   chars → 0.00–0.05
 *   10–50  chars → 0.05–0.25
 *   50–150 chars → 0.25–0.50
 *   150–500      → 0.50–0.75
 *   500–2000     → 0.75–0.90
 *   2000+        → 0.90–1.00 (asymptotic)
 */
function scoreLength(message: string): number {
  const len = message.length;
  if (len <= 10)   return lerp(0, 10, 0.00, 0.05, len);
  if (len <= 50)   return lerp(10, 50, 0.05, 0.25, len);
  if (len <= 150)  return lerp(50, 150, 0.25, 0.50, len);
  if (len <= 500)  return lerp(150, 500, 0.50, 0.75, len);
  if (len <= 2000) return lerp(500, 2000, 0.75, 0.90, len);
  return 0.90 + 0.10 * (1 - Math.exp(-(len - 2000) / 3000));
}

// ── Utilities ───────────────────────────────────────────────────────────────

function lerp(x0: number, x1: number, y0: number, y1: number, x: number): number {
  return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
}

function clamp(v: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, v));
}
