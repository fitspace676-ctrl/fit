import { Injectable } from '@nestjs/common';
import { IntegrationsService } from '../integrations/integrations.service';
import { SenderClient } from '../integrations/sender/sender-client';
import { normalizeGeorgianMobile } from './normalize-phone';

export type SmsResult =
  | { status: 'sent'; messageId: string }
  | { status: 'skipped'; reason: 'not_configured' | 'invalid_phone' | 'empty' }
  | { status: 'failed'; reason: 'rejected' | 'unreachable' };

@Injectable()
export class SmsService {
  constructor(
    private readonly integrations: IntegrationsService,
    private readonly sender: SenderClient,
  ) {}

  async isEnabled(gymId: string): Promise<boolean> {
    return (await this.integrations.getActiveSenderKey(gymId)) !== null;
  }

  async send(
    gymId: string,
    input: {
      to: string | null | undefined;
      content: string;
      kind: 'informational' | 'advertising';
    },
  ): Promise<SmsResult> {
    const key = await this.integrations.getActiveSenderKey(gymId);
    if (!key) return { status: 'skipped', reason: 'not_configured' };
    const destination = normalizeGeorgianMobile(input.to);
    if (!destination) return { status: 'skipped', reason: 'invalid_phone' };
    const content = input.content.trim();
    if (!content) return { status: 'skipped', reason: 'empty' };
    const result = await this.sender.send(key, {
      destination,
      content,
      smsno: input.kind === 'advertising' ? 1 : 2,
    });
    return result.ok
      ? { status: 'sent', messageId: result.messageId }
      : { status: 'failed', reason: result.reason };
  }
}
