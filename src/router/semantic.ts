import { pipeline, env } from '@xenova/transformers';
import { Tier, TaskType } from './types';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';

// 配置 transformers 运行时环境
env.allowLocalModels = false;    // 强制从远端拉取模型
env.remoteHost = 'https://hf-mirror.com'; // 国内镜像
env.useBrowserCache = false;     // Node 运行环境
try {
    // ONNX WASM 线程数限制（低内存占用）
    (env as Record<string, unknown>).backends = {
        ...(env as Record<string, unknown>).backends as object,
        onnx: { wasm: { numThreads: 1 } },
    };
} catch { /* 忽略不支持的环境 */ }

/** 特征提取管道的最小接口契约。 */
interface Extractor {
    (text: string, options: { pooling: string; normalize: boolean }): Promise<{ data: Float32Array }>;
}

let extractorInstance: Extractor | null = null;
let extPromise: Promise<Extractor> | null = null;

// 针对中文优化的轻量级模型
const MODEL_NAME = 'Xenova/bge-small-zh-v1.5';

export async function getExtractor(): Promise<Extractor> {
    if (extractorInstance) return extractorInstance;
    if (!extPromise) {
        extPromise = pipeline('feature-extraction', MODEL_NAME, {
            quantized: true,
        }) as Promise<Extractor>;
    }
    extractorInstance = await extPromise;
    return extractorInstance;
}

export async function getEmbedding(text: string): Promise<number[]> {
    try {
        const extractor = await getExtractor();
        const result = await extractor(text, { pooling: 'mean', normalize: true });
        return Array.from(result.data as Float32Array);
    } catch (error) {
        console.error('[claw-router] error generating embedding:', error);
        return [];
    }
}

export function cosineSimilarity(a: number[], b: number[]): number {
    if (!a || !b || a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
    let dotProd = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        dotProd += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProd / (Math.sqrt(normA) * Math.sqrt(normB));
}

interface Anchor {
    tier?: Tier;
    taskType?: TaskType;
    phrases: string[];
    vector: number[] | null;
}

export const ANCHORS: Anchor[] = [
    { tier: Tier.TRIVIAL, taskType: TaskType.CHAT, phrases: ["你好", "随便聊聊", "今天天气怎么样", "谢谢", "好的", "在吗"], vector: null },
    { tier: Tier.SIMPLE, taskType: TaskType.TRANSLATION, phrases: ["把这段话翻译成英文", "翻译成中文", "中英互译", "这句话是什么意思"], vector: null },
    { tier: Tier.MODERATE, taskType: TaskType.CODING, phrases: ["写一个 Python 脚本用于排序", "帮我用 React 写一个登录组件", "怎么把这个字符串转成数组", "写一段基础代码"], vector: null },
    { tier: Tier.COMPLEX, taskType: TaskType.CODING, phrases: ["请帮我重构这段包含业务逻辑的回调地狱代码", "排查一下多文件的依赖冲突报错", "实现一个带权限管理的 CRUD 网关"], vector: null },
    { tier: Tier.EXPERT, taskType: TaskType.CODING, phrases: ["设计一个高并发的分布式微服务系统架构", "从零搭建一套支持千万级用户的底层平台", "解析 Linux 内核网络协议栈的实现机制"], vector: null },
    { taskType: TaskType.WRITING, phrases: ["帮我写一篇关于人工智能的博客文章", "草拟一份产品发布邮件", "写一首赞美春天的古诗", "为文章起几个吸引人的标题"], vector: null },
    { taskType: TaskType.MATH, phrases: ["求解这个微积分方程", "计算正态分布的概率密度", "证明这个线性代数矩阵的秩", "帮我做一下这道数学题"], vector: null },
];

let anchorsInitialized = false;

/** 计算 anchor phrases 的哈希，用于缓存失效检测。 */
function computeAnchorsHash(): string {
    const data = ANCHORS.map(a => a.phrases.join('|')).join('\n');
    return crypto.createHash('md5').update(data).digest('hex');
}

/** 缓存文件路径：~/.claw-router/anchor-cache.json */
function getCachePath(): string {
    return path.join(os.homedir(), '.claw-router', 'anchor-cache.json');
}

interface AnchorCache {
    hash: string;
    vectors: (number[] | null)[];
}

export async function initializeAnchors() {
    if (anchorsInitialized) return;

    const cachePath = getCachePath();
    const currentHash = computeAnchorsHash();

    // 尝试从磁盘缓存加载
    try {
        if (fs.existsSync(cachePath)) {
            const raw = JSON.parse(fs.readFileSync(cachePath, 'utf-8')) as AnchorCache;
            if (raw.hash === currentHash && raw.vectors.length === ANCHORS.length) {
                for (let i = 0; i < ANCHORS.length; i++) {
                    ANCHORS[i].vector = raw.vectors[i];
                }
                anchorsInitialized = true;
                return;
            }
        }
    } catch { /* 缓存损坏或不可读，重新生成 */ }

    // 缓存未命中，运行模型推理
    for (const anchor of ANCHORS) {
        const combinedText = anchor.phrases.join(". ");
        anchor.vector = await getEmbedding(combinedText);
    }
    anchorsInitialized = true;

    // 写入磁盘缓存
    try {
        const dir = path.dirname(cachePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const cache: AnchorCache = {
            hash: currentHash,
            vectors: ANCHORS.map(a => a.vector),
        };
        fs.writeFileSync(cachePath, JSON.stringify(cache));
    } catch (err) {
        console.warn('[claw-router] 无法写入 anchor 缓存:', err);
    }
}

export async function computeSemanticScores(message: string) {
    await initializeAnchors();
    const msgVec = await getEmbedding(message);
    if (msgVec.length === 0) return null;

    const results = ANCHORS.map(anchor => ({
        tier: anchor.tier,
        taskType: anchor.taskType,
        similarity: cosineSimilarity(msgVec, anchor.vector!)
    })).sort((a, b) => b.similarity - a.similarity);

    return results;
}
