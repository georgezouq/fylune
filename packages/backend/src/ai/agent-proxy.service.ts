import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import type { AgentCompletionDto } from './agent.dto';

const DEFAULT_MODEL = 'openai/gpt-4o-mini';
const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
const REQUEST_TIMEOUT_MS = 300_000;

@Injectable()
export class AgentProxyService {
  constructor(private readonly config: ConfigService) {}

  status() {
    const configured = Boolean(this.config.get<string>('OPENROUTER_API_KEY'));
    return {
      configured,
      provider: configured ? 'openrouter' : null,
      model: configured ? this.model() : null,
      baseUrl: configured ? this.baseUrl() : null,
      protocol: 'openai-chat-completions',
    };
  }

  async complete(userId: string, body: AgentCompletionDto, response: Response) {
    const apiKey = this.config.get<string>('OPENROUTER_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException({
        code: 'AI_NOT_CONFIGURED',
        message: 'Set OPENROUTER_API_KEY on the self-hosted backend to enable the Agent API.',
      });
    }

    const stream = body.stream ?? true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    response.on('close', () => controller.abort());

    let upstream: globalThis.Response;
    try {
      upstream = await fetch(`${this.baseUrl()}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': this.config.get<string>('APP_ORIGIN') ?? 'http://127.0.0.1:5173',
          'X-Title': 'Fylune Open Source Agent',
        },
        body: JSON.stringify({
          messages: body.messages,
          model: this.model(),
          stream,
          ...(body.temperature === undefined ? {} : { temperature: body.temperature }),
          ...(body.max_tokens === undefined ? {} : { max_tokens: body.max_tokens }),
          ...(body.tools === undefined ? {} : { tools: body.tools }),
          user: `fylune:${userId.slice(0, 8)}`,
        }),
      });
    } catch (error) {
      clearTimeout(timeout);
      throw new BadGatewayException({
        code: 'AI_TEXT_UNAVAILABLE',
        message: error instanceof Error && error.name === 'AbortError'
          ? 'The Agent request timed out.'
          : 'The configured AI provider is unavailable.',
      });
    }

    if (!upstream.ok || !upstream.body) {
      clearTimeout(timeout);
      throw new BadGatewayException({
        code: 'AI_TEXT_FAILED',
        message: `The configured AI provider rejected the request (${upstream.status}).`,
      });
    }

    if (!stream) {
      clearTimeout(timeout);
      const payload: unknown = await upstream.json();
      return payload;
    }

    response.status(200);
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.flushHeaders?.();
    try {
      const reader = upstream.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        response.write(Buffer.from(value));
      }
    } finally {
      clearTimeout(timeout);
      response.end();
    }
    return undefined;
  }

  private model() {
    return this.config.get<string>('OPENROUTER_TEXT_MODEL') || DEFAULT_MODEL;
  }

  private baseUrl() {
    return (this.config.get<string>('OPENROUTER_BASE_URL') || DEFAULT_BASE_URL).replace(/\/$/, '');
  }
}
