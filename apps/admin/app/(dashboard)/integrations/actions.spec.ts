import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, fetchIntegrations, mutateFlitt, mutateSender } from '@/lib/api';
import { getServerSession } from '@/lib/session';
import { changeFlitt, changeSender } from './actions';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/session', () => ({ getServerSession: vi.fn() }));
vi.mock('@/lib/api', () => ({
  ApiError: class extends Error {
    constructor(
      public status: number,
      message: string,
      public data?: unknown,
    ) {
      super(message);
    }
  },
  fetchIntegrations: vi.fn(),
  mutateFlitt: vi.fn(),
  mutateSender: vi.fn(),
}));
const command = { kind: 'connect' as const, merchantId: '1549901', secretKey: 'private-key' };
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getServerSession).mockResolvedValue({ role: 'OWNER' } as Awaited<
    ReturnType<typeof getServerSession>
  >);
});
describe('Flitt action boundary', () => {
  it.each(['MANAGER', 'SUPER_ADMIN', 'RECEPTIONIST', 'TRAINER', 'MEMBER'] as const)(
    'refuses %s before sending credentials',
    async (role) => {
      vi.mocked(getServerSession).mockResolvedValue({ role } as Awaited<
        ReturnType<typeof getServerSession>
      >);
      expect(await changeFlitt(command)).toEqual({ ok: false, error: 'forbidden' });
      expect(mutateFlitt).not.toHaveBeenCalled();
    },
  );
  it('revalidates submitted input', async () => {
    expect(await changeFlitt({ ...command, merchantId: 'bad' })).toEqual({
      ok: false,
      error: 'invalid',
    });
    expect(mutateFlitt).not.toHaveBeenCalled();
  });
  it.each(['bad_key', 'unknown_merchant', 'unreachable'])(
    'preserves safe provider reason %s',
    async (reason) => {
      vi.mocked(mutateFlitt).mockRejectedValue(
        new ApiError(400, 'FLITT_VERIFICATION_FAILED', { reason }),
      );
      expect(await changeFlitt(command)).toEqual({ ok: false, error: reason });
    },
  );
  it.each([
    [403, 'FORBIDDEN', 'forbidden'],
    [503, 'INTEGRATIONS_NOT_CONFIGURED', 'notConfigured'],
    [409, 'FLITT_NOT_VERIFIED', 'notVerified'],
  ] as const)('maps %s %s', async (status, code, error) => {
    vi.mocked(mutateFlitt).mockRejectedValue(new ApiError(status, code));
    expect(await changeFlitt(command)).toEqual({ ok: false, error });
  });
  it('never returns arbitrary error contents', async () => {
    vi.mocked(mutateFlitt).mockRejectedValue(new Error(command.secretKey));
    expect(JSON.stringify(await changeFlitt(command))).not.toContain(command.secretKey);
  });
  it('reloads server state after a failed test', async () => {
    vi.mocked(mutateFlitt).mockResolvedValue({ ok: false, reason: 'bad_key' });
    vi.mocked(fetchIntegrations).mockResolvedValue([
      {
        provider: 'flitt',
        enabled: false,
        connected: true,
        merchantId: '1549901',
        secretHint: 'key',
        verifiedAt: null,
        lastError: 'bad_key',
        testMode: true,
      },
    ]);
    expect(await changeFlitt({ kind: 'test' })).toMatchObject({
      ok: false,
      error: 'bad_key',
      data: { enabled: false, verifiedAt: null },
    });
  });
});

const sender = {
  provider: 'sender' as const,
  connected: true,
  enabled: false,
  merchantId: null,
  secretHint: 'ey',
  verifiedAt: '2026-11-20T12:00:00Z',
  lastError: null,
  testMode: false,
};
const senderCommand = { kind: 'connect' as const, apiKey: 'private-key' };
describe('Sender action boundary', () => {
  it.each(['MANAGER', 'SUPER_ADMIN', 'RECEPTIONIST', 'TRAINER', 'MEMBER'] as const)(
    'refuses %s',
    async (role) => {
      vi.mocked(getServerSession).mockResolvedValue({ role } as Awaited<
        ReturnType<typeof getServerSession>
      >);
      expect(await changeSender(senderCommand)).toEqual({ ok: false, error: 'forbidden' });
      expect(mutateSender).not.toHaveBeenCalled();
    },
  );
  it('validates credentials and phone before requesting the API', async () => {
    expect(await changeSender({ kind: 'connect', apiKey: ' ' })).toEqual({
      ok: false,
      error: 'invalid',
    });
    expect(await changeSender({ kind: 'testMessage', phone: '123' })).toEqual({
      ok: false,
      error: 'invalid_phone',
    });
    expect(mutateSender).not.toHaveBeenCalled();
  });
  it('connects with only the trimmed API key', async () => {
    vi.mocked(mutateSender).mockResolvedValue(sender);
    expect(await changeSender({ ...senderCommand, apiKey: ' private-key ' })).toEqual({
      ok: true,
      data: sender,
    });
    expect(mutateSender).toHaveBeenCalledWith('PUT', { apiKey: 'private-key' });
  });
  it.each([true, false])('sets enabled to %s', async (enabled) => {
    vi.mocked(mutateSender).mockResolvedValue({ ...sender, enabled });
    expect(await changeSender({ kind: 'enable', enabled })).toMatchObject({
      ok: true,
      data: { enabled },
    });
    expect(mutateSender).toHaveBeenCalledWith('PATCH', { enabled });
  });
  it('disconnects', async () => {
    vi.mocked(mutateSender).mockResolvedValue({ ...sender, connected: false });
    expect(await changeSender({ kind: 'disconnect' })).toMatchObject({
      ok: true,
      data: { connected: false },
    });
    expect(mutateSender).toHaveBeenCalledWith('DELETE');
  });
  it.each(['bad_key', 'unreachable'])('maps verification reason %s', async (reason) => {
    vi.mocked(mutateSender).mockRejectedValue(
      new ApiError(400, 'SENDER_VERIFICATION_FAILED', { reason }),
    );
    expect(await changeSender(senderCommand)).toEqual({ ok: false, error: reason });
  });
  it.each([
    [403, 'FORBIDDEN', 'forbidden'],
    [503, 'INTEGRATIONS_NOT_CONFIGURED', 'notConfigured'],
    [409, 'SENDER_NOT_VERIFIED', 'notVerified'],
    [409, 'SENDER_CREDENTIALS_CHANGED', 'credentialsChanged'],
  ] as const)('maps %s %s', async (status, code, error) => {
    vi.mocked(mutateSender).mockRejectedValue(new ApiError(status, code));
    expect(await changeSender(senderCommand)).toEqual({ ok: false, error });
  });
  it('returns balance and reloads state by provider', async () => {
    vi.mocked(mutateSender).mockResolvedValue({ ok: true, balance: '123.45' });
    vi.mocked(fetchIntegrations).mockResolvedValue([sender]);
    expect(await changeSender({ kind: 'test' })).toEqual({
      ok: true,
      tested: true,
      balance: '123.45',
      data: sender,
    });
    expect(mutateSender).toHaveBeenCalledWith('POST');
  });
  it('reloads disabled state after failed verification', async () => {
    vi.mocked(mutateSender).mockResolvedValue({ ok: false, reason: 'bad_key' });
    vi.mocked(fetchIntegrations).mockResolvedValue([{ ...sender, verifiedAt: null }]);
    expect(await changeSender({ kind: 'test' })).toMatchObject({
      ok: false,
      error: 'bad_key',
      data: { enabled: false, verifiedAt: null },
    });
  });
  it.each([undefined, 'invalid_phone', 'rejected', 'unreachable'] as const)(
    'sends a test SMS and handles %s',
    async (reason) => {
      vi.mocked(mutateSender).mockResolvedValue({ ok: !reason, reason });
      expect(await changeSender({ kind: 'testMessage', phone: '+995599123456' })).toEqual(
        reason ? { ok: false, error: reason } : { ok: true },
      );
      expect(mutateSender).toHaveBeenCalledWith('POST', { phone: '+995599123456' }, 'test-message');
    },
  );
  it('never returns arbitrary provider content', async () => {
    vi.mocked(mutateSender).mockRejectedValue(
      new ApiError(400, senderCommand.apiKey, { phone: '+995599123456' }),
    );
    expect(await changeSender(senderCommand)).toEqual({ ok: false, error: 'unreachable' });
  });
});
