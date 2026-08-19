import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { AgentMessageRole } from './agent.dto';
import { AgentProxyService } from './agent-proxy.service';

describe('AgentProxyService', () => {
  it('reports provider readiness and keeps the configured model server-side', async () => {
    const values: Record<string, string> = {
      OPENROUTER_API_KEY: 'server-only-key',
      OPENROUTER_TEXT_MODEL: 'openai/gpt-4o-mini',
      APP_ORIGIN: 'http://127.0.0.1:5173',
    };
    const config = { get: vi.fn((key: string) => values[key]) };
    const fetchMock = vi.fn((...args: [URL | string, RequestInit]) => {
      void args;
      return Promise.resolve(new Response(
        JSON.stringify({ id: 'chatcmpl-local', choices: [] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ));
    });
    vi.stubGlobal('fetch', fetchMock);
    const response = { on: vi.fn() };
    const service = new AgentProxyService(config as never);

    expect(service.status()).toMatchObject({
      configured: true,
      provider: 'openrouter',
      model: 'openai/gpt-4o-mini',
    });
    await expect(service.complete('user-123', {
      messages: [{ role: AgentMessageRole.User, content: 'Hello' }],
      stream: false,
    }, response as never)).resolves.toMatchObject({ id: 'chatcmpl-local' });
    const requestBody = fetchMock.mock.calls[0][1]?.body;
    expect(typeof requestBody).toBe('string');
    expect(JSON.parse(requestBody as string)).toMatchObject({
      model: 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: 'Hello' }],
      stream: false,
    });
    expect(requestBody).not.toContain('server-only-key');
    vi.unstubAllGlobals();
  });
});
