import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AgentController } from './agent.controller';
import { AgentProxyService } from './agent-proxy.service';

@Module({
  imports: [AuthModule],
  controllers: [AgentController],
  providers: [AgentProxyService],
})
export class AiModule {}
