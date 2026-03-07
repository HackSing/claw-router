/**
 * @aiwaretop/claw-router — LLM Client
 *
 * 封装 LLM API 调用，内置：
 * - 指数退避重试（最多 2 次重试）
 * - 并发请求限流（默认最大 3 并发）
 * - 错误码区分（429 限流 vs 5xx 服务错误）
 * - 超时保护（可配置，默认 3 秒）
 */

export interface LlmClientConfig {
    apiKey: string;
    baseUrl: string;
    apiPath?: string;
    /** 超时毫秒（默认 3000） */
    timeoutMs?: number;
    /** 最大并发请求数（默认 3） */
    maxConcurrency?: number;
    /** 最大重试次数（默认 2） */
    maxRetries?: number;
}

export class LlmClient {
    private config: Required<LlmClientConfig>;
    private activeCalls = 0;

    constructor(config: LlmClientConfig) {
        this.config = {
            apiPath: '/v1/chat/completions',
            timeoutMs: 3000,
            maxConcurrency: 3,
            maxRetries: 2,
            ...config,
        };
    }

    /**
     * 调用 LLM API
     */
    async invoke(model: string, prompt: string): Promise<string> {
        // 并发限流
        if (this.activeCalls >= this.config.maxConcurrency) {
            throw new Error('[claw-router] LLM 并发数已达上限');
        }

        this.activeCalls++;
        try {
            return await this.invokeWithRetry(model, prompt, 0);
        } finally {
            this.activeCalls--;
        }
    }

    private async invokeWithRetry(model: string, prompt: string, attempt: number): Promise<string> {
        try {
            return await this.doInvoke(model, prompt);
        } catch (error: any) {
            const isRetryable = this.isRetryableError(error);
            if (!isRetryable || attempt >= this.config.maxRetries) {
                throw error;
            }

            // 指数退避：200ms, 400ms
            const delayMs = 200 * Math.pow(2, attempt);
            await new Promise(resolve => setTimeout(resolve, delayMs));

            return this.invokeWithRetry(model, prompt, attempt + 1);
        }
    }

    private async doInvoke(model: string, prompt: string): Promise<string> {
        // 去除 provider/ 前缀
        let actualModel = model;
        const slashIdx = model.indexOf('/');
        if (slashIdx !== -1 && !model.startsWith('http')) {
            const prefix = model.slice(0, slashIdx);
            // 常见 provider 前缀
            if (['siliconflow', 'openai', 'anthropic', 'google', 'deepseek'].includes(prefix.toLowerCase())) {
                actualModel = model.slice(slashIdx + 1);
            }
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

        try {
            const response = await fetch(`${this.config.baseUrl}${this.config.apiPath}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.config.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: actualModel,
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.1,
                    max_tokens: 256,
                }),
                signal: controller.signal,
            });

            if (!response.ok) {
                const errorText = await response.text();
                const err = new Error(`LLM API 错误: ${response.status} - ${errorText}`);
                (err as any).statusCode = response.status;
                throw err;
            }

            const data = await response.json();
            return data.choices?.[0]?.message?.content || '';
        } finally {
            clearTimeout(timeout);
        }
    }

    /** 判断错误是否可重试 */
    private isRetryableError(error: any): boolean {
        // 超时可重试
        if (error.name === 'AbortError') return true;
        // 429 限流可重试
        if (error.statusCode === 429) return true;
        // 5xx 服务端错误可重试
        if (error.statusCode >= 500 && error.statusCode < 600) return true;
        // 网络错误可重试
        if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') return true;

        return false;
    }
}
