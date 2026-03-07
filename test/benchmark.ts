/**
 * @aiwaretop/claw-router — 性能基准测试
 *
 * 对 fixtures 批量评分，输出 P50/P95/P99 延迟和吞吐量。
 * 用法: npx tsx test/benchmark.ts
 */

import { route } from '../src/router/engine';
import { resolveConfig } from '../src/config';
import { fixtures } from './fixtures';

const config = resolveConfig();

async function benchmark() {
    const warmupRounds = 10;
    const testRounds = 100;

    // 预热
    for (let i = 0; i < warmupRounds; i++) {
        for (const tc of fixtures) {
            await route(tc.message, config);
        }
    }

    // 正式测试
    const latencies: number[] = [];
    for (let i = 0; i < testRounds; i++) {
        for (const tc of fixtures) {
            const t0 = performance.now();
            await route(tc.message, config);
            latencies.push(performance.now() - t0);
        }
    }

    // 统计
    latencies.sort((a, b) => a - b);
    const total = latencies.length;
    const p50 = latencies[Math.floor(total * 0.50)];
    const p95 = latencies[Math.floor(total * 0.95)];
    const p99 = latencies[Math.floor(total * 0.99)];
    const avg = latencies.reduce((s, v) => s + v, 0) / total;
    const max = latencies[total - 1];

    console.log(`\n🔀 claw-router 性能基准测试\n${'─'.repeat(40)}`);
    console.log(`消息数:    ${fixtures.length}`);
    console.log(`测试轮数:  ${testRounds}`);
    console.log(`总采样:    ${total}`);
    console.log(`\n延迟（毫秒）:`);
    console.log(`  Avg:     ${avg.toFixed(3)}`);
    console.log(`  P50:     ${p50.toFixed(3)}`);
    console.log(`  P95:     ${p95.toFixed(3)}`);
    console.log(`  P99:     ${p99.toFixed(3)}`);
    console.log(`  Max:     ${max.toFixed(3)}`);
    console.log(`\n吞吐量:    ${(1000 / avg).toFixed(0)} msg/sec`);

    // 断言 P99 < 5ms
    if (p99 > 5) {
        console.error(`\n❌ P99 延迟 ${p99.toFixed(3)}ms 超过 5ms 目标!`);
        process.exit(1);
    }
    console.log(`\n✅ P99 ${p99.toFixed(3)}ms < 5ms 目标`);
}

benchmark().catch(console.error);
