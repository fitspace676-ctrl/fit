import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFitApiClient, FitApiError, qs } from './fit-api';
import { guard } from './tools/shared';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('operator-bound API client', () => {
  it('forwards only bearer authentication and applies a 20-second timeout for every verb', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    vi.stubGlobal('fetch', fetchMock);
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const api = createFitApiClient('one-operator');
    await api.get('/members');
    await api.post('/members', { name: 'Name' });
    await api.patch('/members/1', { name: 'Changed' });
    await api.put('/loyalty/program', { enabled: true });
    await api.del('/staff/1');
    expect(timeout.mock.calls).toEqual(Array.from({ length: 5 }, () => [20_000]));
    for (const call of fetchMock.mock.calls) {
      const [, options] = call as unknown as [string, RequestInit];
      expect((options.headers as Record<string, string>).authorization).toBe('Bearer one-operator');
      expect(Object.keys(options.headers!)).not.toContain('x-gym-id');
    }
  });

  it('preserves the API validation envelope and reports invalid fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              code: 'VALIDATION_FAILED',
              message: 'Validation failed',
              details: ['email: Invalid email', 'amount: Must be positive'],
            }),
            { status: 400 },
          ),
        ),
      ),
    );
    const api = createFitApiClient('operator');
    await expect(api.post('/members', {})).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_FAILED',
      message: 'Validation failed',
      details: ['email: Invalid email', 'amount: Must be positive'],
    });
    const result = await guard(() => api.post('/members', {}));
    expect(result).toHaveProperty('isError', true);
    expect(result.content[0]?.text).toContain('email: Invalid email');
    expect(result.content[0]?.text).toContain('amount: Must be positive');
  });

  it.each([
    [401, 'Session expired'],
    [403, 'Operator lacks this permission; do not retry'],
    [404, 'Not found in this gym'],
    [409, 'Conflict'],
    [500, 'Temporary failure'],
    [503, 'Temporary failure'],
  ])('maps HTTP %s to actionable guidance', async (status, expected) => {
    const result = await guard(() =>
      Promise.reject(new FitApiError(status, 'CODE', 'Explanation')),
    );
    expect(result.content[0]?.text).toContain(expected);
    expect(result).toHaveProperty('isError', true);
  });

  it.each([new TypeError('fetch failed'), new DOMException('timed out', 'TimeoutError')])(
    'treats transport failures as temporary without leaking transport details',
    async (error) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.reject(error)),
      );
      const result = await guard(() => createFitApiClient('secret-token').get('/members'));
      expect(result.content[0]?.text).toContain('Temporary failure');
      expect(result.content[0]?.text).not.toContain('secret-token');
    },
  );

  it('supports Nest message arrays and non-JSON failures', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: ['name: Required'] }), { status: 400 }),
      )
      .mockResolvedValueOnce(new Response('gateway failure', { status: 502 }));
    vi.stubGlobal('fetch', fetchMock);
    const api = createFitApiClient('operator');
    await expect(api.get('/members')).rejects.toMatchObject({
      status: 400,
      code: 'HTTP_400',
      message: 'name: Required',
      details: ['name: Required'],
    });
    expect((await guard(() => api.get('/members'))).content[0]?.text).toContain(
      'Temporary failure',
    );
  });

  it('serializes branch, paging and boolean filters without absent values', () => {
    expect(
      qs({ locationId: 'branch one', page: 2, active: false, empty: '', absent: undefined }),
    ).toBe('?locationId=branch+one&page=2&active=false');
  });
});
