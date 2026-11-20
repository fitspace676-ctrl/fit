import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, fetchIntegrations, mutateFlitt } from '@/lib/api';
import { getServerSession } from '@/lib/session';
import { changeFlitt } from './actions';

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
