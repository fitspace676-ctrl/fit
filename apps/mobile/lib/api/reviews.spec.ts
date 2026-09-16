import { afterEach, describe, expect, it, vi } from 'vitest';
import { env } from '../env';
import { createReview, listTrainerReviews } from './reviews';

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

describe('createReview', () => {
  it('POSTs the occurrence, rating and comment', async () => {
    const calls = stubFetch({ id: 'r_1' }, 201);

    await expect(
      createReview({ classInstanceId: 'ci_1', rating: 5, comment: 'Great' }),
    ).resolves.toEqual({ id: 'r_1' });

    const call = calls[0] as Call;
    expect(call.init.method).toBe('POST');
    expect(call.url).toBe(`${env.apiUrl}/reviews`);
    expect(JSON.parse(call.init.body as string)).toEqual({
      classInstanceId: 'ci_1',
      rating: 5,
      comment: 'Great',
    });
  });

  it('surfaces NOT_ATTENDED and ALREADY_REVIEWED as ApiError codes', async () => {
    stubFetch({ code: 'NOT_ATTENDED', message: 'no', details: null }, 403);
    await expect(createReview({ classInstanceId: 'ci_1', rating: 5 })).rejects.toMatchObject({
      status: 403,
      code: 'NOT_ATTENDED',
    });

    vi.unstubAllGlobals();
    stubFetch({ code: 'ALREADY_REVIEWED', message: 'no', details: null }, 409);
    await expect(createReview({ classInstanceId: 'ci_1', rating: 5 })).rejects.toMatchObject({
      status: 409,
      code: 'ALREADY_REVIEWED',
    });
  });
});

describe('listTrainerReviews', () => {
  it('GETs the public, paginated listing', async () => {
    const calls = stubFetch({ reviews: [], avgRating: 0, total: 0, page: 1, limit: 10 });

    await listTrainerReviews({ trainerId: 't_1', gymId: 'gym_a', page: 2, limit: 5 });

    expect((calls[0] as Call).url).toBe(
      `${env.apiUrl}/trainers/t_1/reviews?gymId=gym_a&page=2&limit=5`,
    );
  });

  it('omits page and limit when unset, letting the server default them', async () => {
    const calls = stubFetch({ reviews: [], avgRating: 0, total: 0, page: 1, limit: 10 });
    await listTrainerReviews({ trainerId: 't_1', gymId: 'gym_a' });
    expect((calls[0] as Call).url).toBe(`${env.apiUrl}/trainers/t_1/reviews?gymId=gym_a`);
  });
});
