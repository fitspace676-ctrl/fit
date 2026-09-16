import { afterEach, describe, expect, it, vi } from 'vitest';
import { env } from '../env';
import { listBanners } from './banners';

interface Call {
  url: string;
  init: RequestInit;
}

function stubFetch(body: unknown = { banners: [] }, status = 200): Call[] {
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

describe('listBanners', () => {
  it('GETs the reel scoped by gymId', async () => {
    const calls = stubFetch();
    await listBanners({ gymId: 'gym_a' });
    expect((calls[0] as Call).url).toBe(`${env.apiUrl}/banners?gymId=gym_a`);
    expect((calls[0] as Call).init.method).toBe('GET');
  });

  it('sends no Authorization header — the route is public and Home renders early', async () => {
    // Not cosmetic: this runs on the first frame of Home, before the session is
    // guaranteed to have hydrated. A route that ignores the header must not be
    // able to fail because of one.
    const calls = stubFetch();
    await listBanners({ gymId: 'gym_a' });
    expect((calls[0] as Call).init.headers).not.toHaveProperty('Authorization');
  });

  it('hands the slides back in the order the API sent them', async () => {
    // The API sorts by `sortOrder` then `createdAt`; the client re-sorts nothing,
    // so a reordered reel in the console is a reordered carousel here.
    stubFetch({
      banners: [
        { id: 'b_1', title: 'Summer', imageUrl: 'https://cdn.test/1.jpg', linkUrl: '/shop' },
        { id: 'b_2', title: null, imageUrl: 'https://cdn.test/2.jpg', linkUrl: null },
      ],
    });

    const result = await listBanners({ gymId: 'gym_a' });

    expect(result.banners.map((banner) => banner.id)).toEqual(['b_1', 'b_2']);
  });

  it('treats a gym with no live banners as a normal empty answer', async () => {
    stubFetch({ banners: [] });
    await expect(listBanners({ gymId: 'gym_a' })).resolves.toEqual({ banners: [] });
  });
});
