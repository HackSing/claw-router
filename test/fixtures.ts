/**
 * @aiwaretop/claw-router — Test Fixtures
 *
 * 35+ test cases covering all 5 tiers, both languages, code snippets,
 * edge cases, and boundary conditions.
 */

import { Tier } from '../src/router/types';

export interface TestCase {
  id: string;
  message: string;
  expectedTier: Tier;
  description: string;
  /** If true, the tier must match via hard-rule override. */
  isOverride?: boolean;
}

export const fixtures: TestCase[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // TRIVIAL — greetings, confirmations, emoji, ultra-short
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'T01',
    message: '你好',
    expectedTier: Tier.TRIVIAL,
    description: 'Chinese greeting (2 chars)',
    isOverride: true,
  },
  {
    id: 'T02',
    message: 'Hi',
    expectedTier: Tier.TRIVIAL,
    description: 'English greeting (2 chars)',
    isOverride: true,
  },
  {
    id: 'T03',
    message: '好的',
    expectedTier: Tier.TRIVIAL,
    description: 'Simple confirmation',
    isOverride: true,
  },
  {
    id: 'T04',
    message: '👍',
    expectedTier: Tier.TRIVIAL,
    description: 'Single emoji',
    isOverride: true,
  },
  {
    id: 'T05',
    message: 'ok',
    expectedTier: Tier.TRIVIAL,
    description: 'Two-letter confirmation',
    isOverride: true,
  },
  {
    id: 'T06',
    message: '谢谢',
    expectedTier: Tier.TRIVIAL,
    description: 'Simple thanks',
    isOverride: true,
  },
  {
    id: 'T07',
    message: 'yes',
    expectedTier: Tier.TRIVIAL,
    description: 'English yes (3 chars)',
    isOverride: true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SIMPLE — one-step, direct answers
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'S01',
    message: '今天天气怎么样？',
    expectedTier: Tier.SIMPLE,
    description: 'Chinese weather query',
  },
  {
    id: 'S02',
    message: 'Translate "hello world" to French',
    expectedTier: Tier.SIMPLE,
    description: 'Simple translation request',
  },
  {
    id: 'S03',
    message: '苹果的英文是什么？',
    expectedTier: Tier.SIMPLE,
    description: 'Simple vocabulary question',
  },
  {
    id: 'S04',
    message: 'What is the capital of Japan?',
    expectedTier: Tier.SIMPLE,
    description: 'Simple factual question',
  },
  {
    id: 'S05',
    message: '帮我算一下 123 × 456',
    expectedTier: Tier.SIMPLE,
    description: 'Simple math calculation',
  },
  {
    id: 'S06',
    message: 'Define photosynthesis in one sentence',
    expectedTier: Tier.SIMPLE,
    description: 'Simple definition request',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MODERATE — requires organization, comparison, creativity
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'M01',
    message: '帮我写一篇关于人工智能发展趋势的短文，500字左右',
    expectedTier: Tier.MODERATE,
    description: 'Chinese article writing (creativity + output)',
  },
  {
    id: 'M02',
    message: 'Compare React and Vue.js, listing the pros and cons of each framework',
    expectedTier: Tier.MODERATE,
    description: 'Framework comparison (domain + reasoning)',
  },
  {
    id: 'M03',
    message: '总结一下这篇文章的核心观点，并用大纲格式输出',
    expectedTier: Tier.MODERATE,
    description: 'Summarize + structured output',
  },
  {
    id: 'M04',
    message: 'Write a blog post about the benefits of remote work',
    expectedTier: Tier.MODERATE,
    description: 'Blog post (creativity)',
  },
  {
    id: 'M05',
    message: '请对比分析一下 PostgreSQL 和 MySQL 的优缺点，给出建议',
    expectedTier: Tier.MODERATE,
    description: 'Database comparison (tech + reasoning)',
  },
  {
    id: 'M06',
    message: '帮我写一首关于春天的现代诗',
    expectedTier: Tier.MODERATE,
    description: 'Chinese poem writing (creativity)',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPLEX — multi-step, coding, debugging, analysis
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'C01',
    message: '用 Python 写一个爬虫，爬取豆瓣电影 Top250 的数据，保存为 JSON 格式，需要处理反爬和分页',
    expectedTier: Tier.COMPLEX,
    description: 'Chinese multi-step coding task',
  },
  {
    id: 'C02',
    message: 'Write a TypeScript function that implements a binary search tree with insert, delete, and balance operations. Include unit tests.',
    expectedTier: Tier.COMPLEX,
    description: 'DSA implementation with tests',
  },
  {
    id: 'C03',
    message: '下面这段代码报错了，帮我调试一下：\n```python\ndef merge_sort(arr):\n    if len(arr) <= 1:\n        return arr\n    mid = len(arr) // 2\n    left = merge_sort(arr[:mid])\n    right = merge_sort(arr[mid:])\n    return merge(left, right)\n```\n```python\ndef merge(left, right):\n    result = []\n    while left and right:\n        if left[0] <= right[0]:\n            result.append(left.pop(0))\n        else:\n            result.append(right.pop(0))\n    return result + left + right\n```\n```python\nprint(merge_sort([3,1,4,1,5,9]))\n```',
    expectedTier: Tier.COMPLEX,
    description: '3 code blocks → override to COMPLEX',
    isOverride: true,
  },
  {
    id: 'C04',
    message: 'Implement a rate limiter using the token bucket algorithm in Go, supporting concurrent access with proper locking',
    expectedTier: Tier.COMPLEX,
    description: 'Concurrent algo implementation',
  },
  {
    id: 'C05',
    message: '帮我用 React + TypeScript 实现一个拖拽排序组件，支持触摸设备，需要性能优化',
    expectedTier: Tier.COMPLEX,
    description: 'Complex React component',
  },
  {
    id: 'C06',
    message: 'Analyze this SQL query performance issue and suggest optimizations:\n```sql\nSELECT u.*, COUNT(o.id) as order_count\nFROM users u\nLEFT JOIN orders o ON u.id = o.user_id\nWHERE o.created_at > NOW() - INTERVAL 30 DAY\nGROUP BY u.id\nORDER BY order_count DESC\nLIMIT 100;\n```',
    expectedTier: Tier.COMPLEX,
    description: 'SQL optimization with code',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // EXPERT — architecture, deep reasoning, formal proofs
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'E01',
    message: '请从零搭建一个高并发消息队列系统，支持百万级 TPS，需要详细的架构设计、技术选型和部署方案',
    expectedTier: Tier.EXPERT,
    description: 'Chinese "从零搭建" → override to EXPERT',
    isOverride: true,
  },
  {
    id: 'E02',
    message: 'Design a system for a real-time collaborative document editor like Google Docs, covering conflict resolution, operational transformation, and eventual consistency',
    expectedTier: Tier.EXPERT,
    description: 'System design → override to EXPERT',
    isOverride: true,
  },
  {
    id: 'E03',
    message: '请设计一个分布式系统架构设计方案，支持跨地域数据同步、故障自动切换和灰度发布',
    expectedTier: Tier.EXPERT,
    description: 'Chinese 架构设计 → override',
    isOverride: true,
  },
  {
    id: 'E04',
    message: 'Prove that the halting problem is undecidable using a diagonalization argument. Then explain the implications for static program analysis and discuss Rice\'s theorem as a generalization.',
    expectedTier: Tier.EXPERT,
    description: 'Formal proof + deep theoretical CS',
  },
  {
    id: 'E05',
    message: '从量子计算的角度分析 Shor 算法对 RSA 加密的威胁，推导算法的核心数学原理，并讨论后量子密码学的替代方案',
    expectedTier: Tier.EXPERT,
    description: 'Quantum computing deep analysis',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Edge cases & mixed language
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'X01',
    message: '',
    expectedTier: Tier.TRIVIAL,
    description: 'Empty message',
    isOverride: true,
  },
  {
    id: 'X02',
    message: '   ',
    expectedTier: Tier.TRIVIAL,
    description: 'Whitespace only',
    isOverride: true,
  },
  {
    id: 'X03',
    message: '帮我用 Python 写个 hello world 然后 deploy 到 Docker container 上',
    expectedTier: Tier.MODERATE,
    description: 'Mixed CN/EN with tech terms',
  },
  {
    id: 'X04',
    message: 'API',
    expectedTier: Tier.TRIVIAL,
    description: 'Short tech word — hasTechToken prevents short override but still scores low',
  },
];
