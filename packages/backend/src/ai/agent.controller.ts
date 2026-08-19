import { Body, Controller, Get, Inject, Post, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AgentCompletionDto } from './agent.dto';
import { AgentProxyService } from './agent-proxy.service';

@Controller('ai/agent')
@UseGuards(JwtAuthGuard)
export class AgentController {
  constructor(@Inject(AgentProxyService) private readonly proxy: AgentProxyService) {}

  @Get('status')
  status() {
    return this.proxy.status();
  }

  @Get('skills')
  skills() {
    return [
      {
        id: 'workspace-edit',
        name: 'Workspace editing',
        description: 'Use Fylune local JSON-RPC to inspect and safely apply file changes.',
        source: 'local',
      },
      {
        id: 'structured-output',
        name: 'Structured output',
        description: 'Return a concise plan or patch for the local Agent protocol to review.',
        source: 'self-hosted',
      },
    ];
  }

  @Post('v1/chat/completions')
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  async completions(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: AgentCompletionDto,
    @Res() response: Response,
  ) {
    const result = await this.proxy.complete(user.id, body, response);
    if (result !== undefined) response.json(result);
  }
}
