import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../integrations/integrations.module';
import { SmsService } from './sms.service';

@Module({ imports: [IntegrationsModule], providers: [SmsService], exports: [SmsService] })
export class SmsModule {}
