import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, requestZkteco, fetchLocations } from '@/lib/api';
import { getServerSession } from '@/lib/session';
import { changeZkteco, setZktecoMemberCard } from './zkteco-actions';

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
  requestZkteco: vi.fn(),
  fetchLocations: vi.fn(),
}));
const input = {
  connectionType: 'zkbio' as const,
  baseUrl: 'https://bio.example.ge',
  apiToken: 'private-token',
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getServerSession).mockResolvedValue({ role: 'OWNER' } as Awaited<
    ReturnType<typeof getServerSession>
  >);
});
describe('ZKTeco action boundary', () => {
  it.each(['MANAGER', 'RECEPTIONIST', 'TRAINER', 'MEMBER', 'SUPER_ADMIN'] as const)(
    'refuses %s before contacting API',
    async (role) => {
      vi.mocked(getServerSession).mockResolvedValue({ role } as Awaited<
        ReturnType<typeof getServerSession>
      >);
      expect(await changeZkteco({ kind: 'connect', input })).toEqual({
        ok: false,
        error: 'forbidden',
      });
      expect(requestZkteco).not.toHaveBeenCalled();
    },
  );
  it.each([
    input,
    {
      connectionType: 'device' as const,
      host: 'device.example.ge',
      port: 4370,
      deviceNumber: 1,
      commKey: 0,
      recordSize: 72 as const,
    },
  ])('connects with validated input %s', async (value) => {
    vi.mocked(requestZkteco).mockResolvedValue({ connected: true });
    expect(await changeZkteco({ kind: 'connect', input: value })).toMatchObject({ ok: true });
    expect(requestZkteco).toHaveBeenCalledWith('PUT', '', value);
  });
  it('rejects invalid connection and settings before sending', async () => {
    expect(
      await changeZkteco({ kind: 'connect', input: { ...input, apiToken: '' } }),
    ).toMatchObject({ error: 'invalid' });
    expect(await changeZkteco({ kind: 'settings', input: { openSeconds: 61 } })).toMatchObject({
      error: 'invalid',
    });
    expect(
      await changeZkteco({ kind: 'settings', input: { timeZone: 'not/a/zone' } }),
    ).toMatchObject({ error: 'invalid' });
    expect(requestZkteco).not.toHaveBeenCalled();
  });
  it.each([
    'unauthorized',
    'unreachable',
    'timeout',
    'not_zkbio',
    'blocked_host',
    'invalid_connection',
    'protocol',
  ])('maps verification reason %s', async (reason) => {
    vi.mocked(requestZkteco).mockRejectedValue(
      new ApiError(400, 'ZKTECO_VERIFICATION_FAILED', { reason }),
    );
    expect(await changeZkteco({ kind: 'connect', input })).toEqual({ ok: false, error: reason });
  });
  it.each([
    [403, 'INTEGRATIONS_OWNER_ONLY', 'forbidden'],
    [409, 'ZKTECO_NOT_VERIFIED', 'notVerified'],
    [409, 'ZKTECO_CREDENTIALS_CHANGED', 'credentialsChanged'],
    [400, 'ZKTECO_SETTING_UNSUPPORTED', 'unsupported'],
    [409, 'ZKTECO_UNSUPPORTED', 'unsupported'],
    [400, 'ZKTECO_ZONE_REQUIRED', 'zoneRequired'],
    [400, 'LOCATION_NOT_FOUND', 'locationMissing'],
  ] as const)('maps %s %s', async (status, code, error) => {
    vi.mocked(requestZkteco).mockRejectedValue(new ApiError(status, code));
    expect(await changeZkteco({ kind: 'test' })).toEqual({ ok: false, error });
  });
  it('does not expose provider contents or credentials', async () => {
    vi.mocked(requestZkteco).mockRejectedValue(
      new ApiError(400, input.apiToken, { reason: input.apiToken }),
    );
    expect(JSON.stringify(await changeZkteco({ kind: 'connect', input }))).not.toContain(
      input.apiToken,
    );
  });
  it('reloads disabled state after a failed test', async () => {
    vi.mocked(requestZkteco)
      .mockResolvedValueOnce({ ok: false, reason: 'timeout' })
      .mockResolvedValueOnce({ connected: true, enabled: false, verifiedAt: null });
    expect(await changeZkteco({ kind: 'test' })).toMatchObject({
      ok: false,
      error: 'timeout',
      data: { enabled: false, verifiedAt: null },
    });
    expect(requestZkteco).toHaveBeenNthCalledWith(2, 'GET');
  });
  it.each(['no_door_selected', 'unreachable', 'timeout', 'unauthorized', 'rejected'])(
    'returns door reason %s with no retry',
    async (reason) => {
      vi.mocked(requestZkteco).mockResolvedValue({ ok: false, reason });
      expect(await changeZkteco({ kind: 'open' })).toMatchObject({ ok: false, error: reason });
      expect(requestZkteco).toHaveBeenCalledTimes(1);
      expect(requestZkteco).toHaveBeenCalledWith('POST', '/open-door', {});
    },
  );
  it.each(['already_running', 'not_enabled'])('returns sync reason %s', async (reason) => {
    vi.mocked(requestZkteco).mockResolvedValue({ accepted: false, reason });
    expect(await changeZkteco({ kind: 'sync' })).toMatchObject({ ok: false, error: reason });
  });
  it('accepts a queued sync', async () => {
    vi.mocked(requestZkteco).mockResolvedValue({ accepted: true });
    expect(await changeZkteco({ kind: 'sync' })).toMatchObject({ ok: true });
  });
  it('reads all location pages alongside unavailable resources', async () => {
    vi.mocked(requestZkteco).mockResolvedValue({ unavailable: ['areas'] });
    vi.mocked(fetchLocations)
      .mockResolvedValueOnce({
        data: [{ id: 'a', name: 'A' }],
        total: 2,
        page: 1,
        limit: 1,
      } as Awaited<ReturnType<typeof fetchLocations>>)
      .mockResolvedValueOnce({
        data: [{ id: 'b', name: 'B' }],
        total: 2,
        page: 2,
        limit: 1,
      } as Awaited<ReturnType<typeof fetchLocations>>);
    expect(await changeZkteco({ kind: 'resources' })).toMatchObject({
      resources: { unavailable: ['areas'] },
      locations: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
    });
  });
});
describe('member access cards', () => {
  it.each(['1', '4294967295', null])('saves valid card %s', async (card) => {
    expect(await setZktecoMemberCard('member-id', card)).toEqual({ ok: true });
    expect(requestZkteco).toHaveBeenCalledWith('PUT', '/members/member-id/card', {
      cardNumber: card,
    });
  });
  it.each(['', 'abc', '-1', '4294967296', '12345678901'])('refuses card %s', async (card) => {
    expect(await setZktecoMemberCard('member-id', card)).toMatchObject({
      ok: false,
      error: 'invalidCard',
    });
    expect(requestZkteco).not.toHaveBeenCalled();
  });
  it('explains card conflicts', async () => {
    vi.mocked(requestZkteco).mockRejectedValue(new ApiError(409, 'ACCESS_CARD_IN_USE'));
    expect(await setZktecoMemberCard('member-id', '123')).toEqual({
      ok: false,
      error: 'cardInUse',
    });
  });
  it('requires member write permission', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    expect(await setZktecoMemberCard('member-id', '123')).toEqual({
      ok: false,
      error: 'forbidden',
    });
    expect(requestZkteco).not.toHaveBeenCalled();
  });
});
