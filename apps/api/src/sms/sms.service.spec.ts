import { describe, expect, it, vi } from 'vitest';
import type { IntegrationsService } from '../integrations/integrations.service';
import type { SenderClient } from '../integrations/sender/sender-client';
import { SmsService } from './sms.service';

function setup() {
  const integrations = { getActiveSenderKey: vi.fn().mockResolvedValue('key') };
  const sender = { send: vi.fn().mockResolvedValue({ ok: true, messageId: 'sms-1' }) };
  return {
    integrations,
    sender,
    service: new SmsService(
      integrations as unknown as IntegrationsService,
      sender as unknown as SenderClient,
    ),
  };
}
const message = { to: '+995 599 12 34 56', content: ' Hi ', kind: 'informational' as const };
describe('SmsService', () => {
  it.each([
    ['informational', 2],
    ['advertising', 1],
  ] as const)('sends %s with the correct SmsNo mode', async (kind, smsno) => {
    const { service, sender, integrations } = setup();
    expect(await service.send('gym', { ...message, kind })).toEqual({
      status: 'sent',
      messageId: 'sms-1',
    });
    expect(integrations.getActiveSenderKey).toHaveBeenCalledWith('gym');
    expect(sender.send).toHaveBeenCalledWith('key', {
      destination: '599123456',
      content: 'Hi',
      smsno,
    });
  });
  it('skips disabled/disconnected integrations without reaching the provider', async () => {
    const { service, sender, integrations } = setup();
    integrations.getActiveSenderKey.mockResolvedValue(null);
    expect(await service.isEnabled('gym')).toBe(false);
    expect(await service.send('gym', message)).toEqual({
      status: 'skipped',
      reason: 'not_configured',
    });
    expect(sender.send).not.toHaveBeenCalled();
  });
  it.each([
    [{ to: null }, 'invalid_phone'],
    [{ to: '+12125551234' }, 'invalid_phone'],
    [{ content: '  ' }, 'empty'],
  ] as const)('skips unusable input %o', async (input, reason) => {
    const { service, sender } = setup();
    expect(await service.send('gym', { ...message, ...input })).toEqual({
      status: 'skipped',
      reason,
    });
    expect(sender.send).not.toHaveBeenCalled();
  });
  it.each(['rejected', 'unreachable'])('reports %s without retry', async (reason) => {
    const { service, sender } = setup();
    sender.send.mockResolvedValue({ ok: false, reason });
    expect(await service.send('gym', message)).toEqual({ status: 'failed', reason });
    expect(sender.send).toHaveBeenCalledTimes(1);
  });
  it('preserves the internal tenant assertion', async () => {
    const { service, sender, integrations } = setup();
    integrations.getActiveSenderKey.mockRejectedValue(new Error('Integration tenant mismatch'));
    await expect(service.send('other', message)).rejects.toThrow('Integration tenant mismatch');
    expect(sender.send).not.toHaveBeenCalled();
  });
});
