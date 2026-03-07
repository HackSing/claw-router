/**
 * @aiwaretop/claw-router — Route Cache
 *
 * LRU 缓存：对相同消息的路由结果进行缓存，避免重复评分。
 * 评分是纯函数，非常适合缓存。
 */

import type { RouteDecision } from './router/types';

interface CacheEntry {
    decision: RouteDecision;
    timestamp: number;
}

export class RouteCache {
    private cache = new Map<string, CacheEntry>();
    private maxSize: number;
    private ttlMs: number;

    /**
     * @param maxSize 最大缓存条目数（默认 256）
     * @param ttlMs   缓存存活时间（默认 5 分钟）
     */
    constructor(maxSize = 256, ttlMs = 5 * 60 * 1000) {
        this.maxSize = maxSize;
        this.ttlMs = ttlMs;
    }

    /** 查询缓存，未命中或过期返回 null */
    get(message: string): RouteDecision | null {
        const entry = this.cache.get(message);
        if (!entry) return null;

        if (Date.now() - entry.timestamp > this.ttlMs) {
            this.cache.delete(message);
            return null;
        }

        return entry.decision;
    }

    /** 存入缓存，自动淘汰最旧条目 */
    set(message: string, decision: RouteDecision): void {
        // LRU 淘汰：超出容量时删除最早插入的
        if (this.cache.size >= this.maxSize) {
            const oldestKey = this.cache.keys().next().value;
            if (oldestKey !== undefined) {
                this.cache.delete(oldestKey);
            }
        }

        this.cache.set(message, { decision, timestamp: Date.now() });
    }

    /** 当前缓存大小 */
    get size(): number {
        return this.cache.size;
    }

    /** 清空缓存 */
    clear(): void {
        this.cache.clear();
    }
}
