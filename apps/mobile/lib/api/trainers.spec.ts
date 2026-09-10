import { afterEach, describe, expect, it, vi } from 'vitest';
import { env } from '../env';
import { getTrainer, listTrainers } from './trainers';

interface Call {
  url: string;
  init: RequestInit;
}

function stubFetch(body: unknown = {}, status = 200): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('listTrainers', () => {
  it('GETs the roster scoped by gymId', async () => {
    const calls = stubFetch({ trainers: [] });
    await listTrainers({ gymId: 'gym_a' });
    expect((calls[0] as Call).url).toBe(`${env.apiUrl}/trainers?gymId=gym_a`);
  });
});

describe('getTrainer', () => {
  it('puts the id in the path and the gym on the query string', async () => {
    const calls = stubFetch({ trainer: { id: 't_1' } });
    await getTrainer({ trainerId: 't_1', gymId: 'gym_a' });
    expect((calls[0] as Call).url).toBe(`${env.apiUrl}/trainers/t_1?gymId=gym_a`);
  });

  it('surfaces a cross-tenant id as a plain 404 — the same answer as an unknown id', async () => {
    stubFetch({ code: 'NOT_FOUND', message: 'Not found', details: null }, 404);
    await expect(getTrainer({ trainerId: 't_other', gymId: 'gym_a' })).rejects.toMatchObject({
      status: 404,
    });
  });
});
