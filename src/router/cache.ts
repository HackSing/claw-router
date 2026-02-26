/**
 * @aiwaretop/claw-router — LLM Scoring Cache
 *
 * Cache for LLM evaluation results to avoid redundant API calls.
 */

import { Tier } from './types';

// ── Types ───────────────────────────────────────────────────────────────────

export interface CacheEntry {
  tier: Tier;
  confidence: number;
  reasoning: string;
  dimensions: Record<string, number>;
  timestamp: number;
}

export interface CacheConfig {
  maxEntries: number;
  defaultTTL: number;
  ttlByTier: Record<Tier, number>;
}

// ── Default Config ─────────────────────────────────────────────────────────

export const CACHE_DEFAULTS: CacheConfig = {
  maxEntries: 1000,
  defaultTTL: 24 * 60 * 60 * 1000, // 24 hours
  ttlByTier: {
    [Tier.TRIVIAL]: 12 * 60 * 60 * 1000,
    [Tier.SIMPLE]: 24 * 60 * 60 * 1000,
    [Tier.MODERATE]: 24 * 60 * 60 * 1000,
    [Tier.COMPLEX]: 48 * 60 * 60 * 1000,
    [Tier.EXPERT]: 72 * 60 * 60 * 1000,
  },
};

// ── Cache Implementation ───────────────────────────────────────────────────

export class LlmCache {
  private cache = new Map<string, CacheEntry>();
  private accessOrder: string[] = [];
  private config: CacheConfig;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...CACHE_DEFAULTS, ...config };
    this.startCleanupTask();
  }

  /**
   * Generate a hash key for the message
   */
  private hashMessage(message: string): string {
    const normalized = message.toLowerCase().trim();
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Check if entry exists and is valid
   */
  get(message: string): CacheEntry | null {
    const key = this.hashMessage(message);
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    const ttl = this.config.ttlByTier[entry.tier] || this.config.defaultTTL;
    if (Date.now() - entry.timestamp > ttl) {
      this.cache.delete(key);
      this.accessOrder = this.accessOrder.filter(k => k !== key);
      return null;
    }

    this.accessOrder = this.accessOrder.filter(k => k !== key);
    this.accessOrder.push(key);

    return entry;
  }

  /**
   * Store evaluation result
   */
  set(message: string, entry: Omit<CacheEntry, 'timestamp'>): void {
    const key = this.hashMessage(message);

    if (this.cache.size >= this.config.maxEntries && !this.cache.has(key)) {
      const oldest = this.accessOrder.shift();
      if (oldest) {
        this.cache.delete(oldest);
      }
    }

    this.cache.set(key, {
      ...entry,
      timestamp: Date.now(),
    });

    this.accessOrder = this.accessOrder.filter(k => k !== key);
    this.accessOrder.push(key);
  }

  /**
   * Periodic cleanup of expired entries
   */
  private startCleanupTask(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.cache) {
        const ttl = this.config.ttlByTier[entry.tier] || this.config.defaultTTL;
        if (now - entry.timestamp > ttl) {
          this.cache.delete(key);
          this.accessOrder = this.accessOrder.filter(k => k !== key);
        }
      }
    }, 60 * 60 * 1000);
  }
}
