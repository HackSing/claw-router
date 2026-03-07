import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import clawRouterPlugin from '../index';

function createCommandStub() {
  return {
    description() { return this; },
    action() { return this; },
    argument() { return this; },
    command() { return createCommandStub(); },
  };
}

function createFakeApi(pluginConfig: Record<string, unknown>) {
  const handlers: Record<string, Function> = {};
  const logs: string[] = [];

  return {
    handlers,
    logs,
    api: {
      pluginConfig,
      logger: {
        info: (msg: string) => logs.push(msg),
        warn: (msg: string) => logs.push(`WARN:${msg}`),
      },
      on: (event: string, handler: Function) => {
        handlers[event] = handler;
      },
      registerTool: () => {},
      registerCommand: () => {},
      registerCli: (fn: Function) => {
        fn({ program: { command: () => createCommandStub() } });
      },
      registerGatewayMethod: () => {},
    },
  };
}

function withTempHome() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claw-router-'));
  const previous = {
    HOME: process.env.HOME,
    USERPROFILE: process.env.USERPROFILE,
  };

  process.env.HOME = tempDir;
  process.env.USERPROFILE = tempDir;

  return {
    tempDir,
    restore() {
      if (previous.HOME === undefined) delete process.env.HOME;
      else process.env.HOME = previous.HOME;

      if (previous.USERPROFILE === undefined) delete process.env.USERPROFILE;
      else process.env.USERPROFILE = previous.USERPROFILE;

      fs.rmSync(tempDir, { recursive: true, force: true });
    },
  };
}

function seedSessionStore(tempDir: string, sessionKey: string) {
  const storePath = path.join(
    tempDir,
    '.openclaw', 'agents', 'main', 'sessions', 'sessions.json',
  );
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  fs.writeFileSync(storePath, JSON.stringify({
    [sessionKey]: {
      model: 'base-model',
      modelProvider: 'base-provider',
      updatedAt: Date.now(),
    },
  }, null, 2));
  return storePath;
}

function readSessionStore(storePath: string) {
  return JSON.parse(fs.readFileSync(storePath, 'utf-8'));
}

describe('Plugin lifecycle regressions', () => {
  it('agent_end clears model override even when logging is disabled and tokenUsage is missing', async () => {
    const home = withTempHome();
    try {
      const sessionKey = 'agent:main:session-1';
      const storePath = seedSessionStore(home.tempDir, sessionKey);
      const { api, handlers } = createFakeApi({
        models: [{ id: 'test-provider/chat-model', traits: ['chat', 'TRIVIAL', 'SIMPLE'] }],
        enableSemanticRouting: false,
        logging: false,
      });

      clawRouterPlugin.register(api);
      await handlers.before_agent_start(
        { prompt: 'hi' },
        { sessionKey, trigger: 'user' },
      );

      let store = readSessionStore(storePath);
      assert.equal(store[sessionKey].providerOverride, 'test-provider');
      assert.equal(store[sessionKey].modelOverride, 'chat-model');

      await handlers.agent_end(
        { messages: [], success: true },
        { sessionKey },
      );

      store = readSessionStore(storePath);
      assert.ok(!('providerOverride' in store[sessionKey]));
      assert.ok(!('modelOverride' in store[sessionKey]));
    } finally {
      home.restore();
    }
  });

  it('agent_end token log reads the active session model from the shared session path', async () => {
    const home = withTempHome();
    try {
      const sessionKey = 'agent:main:session-2';
      seedSessionStore(home.tempDir, sessionKey);
      const { api, handlers, logs } = createFakeApi({
        models: [{ id: 'test-provider/chat-model', traits: ['chat', 'TRIVIAL', 'SIMPLE'] }],
        enableSemanticRouting: false,
        logging: true,
      });

      clawRouterPlugin.register(api);
      await handlers.before_agent_start(
        { prompt: 'hi' },
        { sessionKey, trigger: 'user' },
      );

      await handlers.agent_end(
        {
          messages: [],
          success: true,
          durationMs: 12,
          tokenUsage: { input: 11, output: 7 },
        },
        { sessionKey },
      );

      assert.ok(
        logs.some(log => log.includes('Tokens: 11 in / 7 out') && log.includes('model: test-provider/chat-model')),
        `Expected token log with overridden model, got logs:\n${logs.join('\n')}`,
      );
    } finally {
      home.restore();
    }
  });
});
