import { pipeline, env } from '@xenova/transformers';
import { Tier, TaskType } from './types';

// Configure transformers context
env.allowLocalModels = false;    // forces fetching from remote
env.remoteHost = 'https://hf-mirror.com'; // Mirror for mainland China
env.useBrowserCache = false;     // node environment
// @ts-ignore
env.backends.onnx.wasm.numThreads = 1; // Limit threading for low memory usage

let extractorInstance: any = null;
let extPromise: Promise<any> | null = null;

// Lightweight model optimized for Chinese.
const MODEL_NAME = 'Xenova/bge-small-zh-v1.5';

export async function getExtractor(): Promise<any> {
    if (extractorInstance) return extractorInstance;
    if (!extPromise) {
        extPromise = pipeline('feature-extraction', MODEL_NAME, {
            quantized: true,
        });
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

export async function initializeAnchors() {
    if (anchorsInitialized) return;
    for (const anchor of ANCHORS) {
        const combinedText = anchor.phrases.join(". ");
        anchor.vector = await getEmbedding(combinedText);
    }
    anchorsInitialized = true;
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
