/**
 * @aiwaretop/claw-router — Config Tests
 *
 * 测试配置合并、默认值覆盖和校验逻辑。
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveConfig } from '../src/config';
import { Dimension, DEFAULT_WEIGHTS, DEFAULT_THRESHOLDS } from '../src/router/types';

describe('resolveConfig — 默认值', () => {
    it('无参数时返回默认配置', () => {
        const config = resolveConfig();
        assert.deepEqual(config.thresholds, [...DEFAULT_THRESHOLDS]);
        assert.deepEqual(config.weights, { ...DEFAULT_WEIGHTS });
        assert.equal(config.logging, false);
        assert.equal(config.models.length, 1);
        assert.equal(config.models[0].id, 'default');
    });

    it('空对象时返回默认配置', () => {
        const config = resolveConfig({});
        assert.equal(config.models.length, 1);
        assert.equal(config.models[0].id, 'default');
    });
});

describe('resolveConfig — 模型合并', () => {
    it('用户模型 + 自动追加 default', () => {
        const config = resolveConfig({
            models: [{ id: 'my-model', traits: ['coding', 'COMPLEX'] }],
        });
        assert.equal(config.models.length, 2);
        assert.equal(config.models[0].id, 'my-model');
        assert.equal(config.models[1].id, 'default');
    });

    it('用户已含 default 则不重复追加', () => {
        const config = resolveConfig({
            models: [
                { id: 'default', traits: ['TRIVIAL'] },
                { id: 'other', traits: ['COMPLEX'] },
            ],
        });
        assert.equal(config.models.length, 2);
    });
});

describe('resolveConfig — thresholds 校验', () => {
    it('合法 thresholds 被采用', () => {
        const config = resolveConfig({ thresholds: [0.1, 0.3, 0.5, 0.7] });
        assert.deepEqual(config.thresholds, [0.1, 0.3, 0.5, 0.7]);
    });

    it('非递增 thresholds 回退默认值', () => {
        const config = resolveConfig({ thresholds: [0.5, 0.3, 0.7, 0.9] });
        assert.deepEqual(config.thresholds, [...DEFAULT_THRESHOLDS]);
    });

    it('长度不足 4 回退默认值', () => {
        const config = resolveConfig({ thresholds: [0.1, 0.3, 0.5] as any });
        assert.deepEqual(config.thresholds, [...DEFAULT_THRESHOLDS]);
    });
});

describe('resolveConfig — weights 合并', () => {
    it('部分覆盖，其余保持默认', () => {
        const config = resolveConfig({
            scoring: { weights: { [Dimension.REASONING]: 0.30 } },
        });
        assert.equal(config.weights[Dimension.REASONING], 0.30);
        assert.equal(config.weights[Dimension.CODE_TECH], DEFAULT_WEIGHTS[Dimension.CODE_TECH]);
    });
});

describe('resolveConfig — traits 校验', () => {
    it('含无效 trait 时不崩溃（仅输出警告）', () => {
        const config = resolveConfig({
            models: [{ id: 'test', traits: ['coding', 'INVALID_TRAIT'] }],
        });
        // 不应抛异常，模型仍应存在
        assert.ok(config.models.some(m => m.id === 'test'));
    });
});

describe('resolveConfig — semantic routing', () => {
    it('默认关闭语义路由，保持纯规则路径', () => {
        const config = resolveConfig();
        assert.equal(config.enableSemanticRouting, false);
    });

    it('显式配置 enableSemanticRouting=true 时启用', () => {
        const config = resolveConfig({ enableSemanticRouting: true });
        assert.equal(config.enableSemanticRouting, true);
    });

    it('plugin schema 暴露 enableSemanticRouting 配置项', () => {
        const manifest = JSON.parse(
            readFileSync(new URL('../openclaw.plugin.json', import.meta.url), 'utf-8'),
        );
        assert.equal(manifest.configSchema.properties.enableSemanticRouting.type, 'boolean');
        assert.equal(manifest.configSchema.properties.enableSemanticRouting.default, false);
    });
});
