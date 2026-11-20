import { SenderClient } from './sender/sender-client';
import { Module } from '@nestjs/common';
import { SecretBox } from '../common/crypto/secret-box';
import { FlittClient } from './flitt/flitt-client';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';

@Module({
  controllers: [IntegrationsController],
  providers: [IntegrationsService, FlittClient, SenderClient, SecretBox],
  exports: [IntegrationsService, FlittClient, SenderClient],
})
export class IntegrationsModule {}
