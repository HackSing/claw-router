/**
 * @aiwaretop/claw-router — Session Store
 *
 * 会话文件读写：直接操作 OpenClaw session JSON 文件实现模型覆盖。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * 从 sessionKey 解析 agentId。
 * sessionKey 格式: "agent:<agentId>:<sessionId>"
 */
export function parseAgentId(sessionKey: string): string {
    const parts = sessionKey.split(':');
    if (parts.length >= 2 && parts[0] === 'agent') {
        return parts[1];
    }
    return 'main';
}

/**
 * 解析 "provider/model" 格式的模型引用。
 */
export function parseModelRef(ref: string): { provider: string; model: string } {
    const idx = ref.indexOf('/');
    if (idx === -1) return { provider: '', model: ref };
    return { provider: ref.slice(0, idx), model: ref.slice(idx + 1) };
}

/**
 * 直接写入 session store 设置模型覆盖。
 * 读写 ~/.openclaw/agents/<agentId>/sessions/sessions.json。
 */
export function applyModelToSession(
    sessionKey: string,
    modelRef: string,
    log: { info: (m: string) => void; warn?: (m: string) => void },
): boolean {
    try {
        const agentId = parseAgentId(sessionKey);
        const storePath = path.join(
            process.env.HOME || '/home/ubuntu',
            '.openclaw', 'agents', agentId, 'sessions', 'sessions.json',
        );

        if (!fs.existsSync(storePath)) {
            log.warn?.(`[claw-router] Session store not found: ${storePath}`);
            return false;
        }

        const raw = fs.readFileSync(storePath, 'utf-8');
        const store = JSON.parse(raw);
        const entry = store[sessionKey];

        if (!entry) {
            log.warn?.(`[claw-router] Session not found: ${sessionKey}`);
            return false;
        }

        const { provider, model } = parseModelRef(modelRef);
        if (!provider || !model) return false;

        // 已设置同一模型则跳过
        if (entry.modelOverride === model && entry.providerOverride === provider) {
            return false;
        }

        entry.modelOverride = model;
        entry.providerOverride = provider;
        entry.updatedAt = Date.now();

        // 写前重新读取校验（降低竞态风险）
        try {
            const freshRaw = fs.readFileSync(storePath, 'utf-8');
            const freshStore = JSON.parse(freshRaw);
            const freshEntry = freshStore[sessionKey];
            if (freshEntry) {
                freshEntry.modelOverride = model;
                freshEntry.providerOverride = provider;
                freshEntry.updatedAt = Date.now();
                fs.writeFileSync(storePath, JSON.stringify(freshStore, null, 2));
            }
        } catch (_writeErr) {
            // 写前校验失败时回退到直接写入
            fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
        }
        return true;
    } catch (err) {
        log.warn?.(`[claw-router] Failed to apply model override: ${err}`);
        return false;
    }
}
