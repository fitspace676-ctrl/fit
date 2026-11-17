// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as LiveRefreshModule from './use-live-refresh';
import type * as SessionModule from './use-session';

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
const router = { refresh };
vi.mock('next/navigation', () => ({ useRouter: () => router }));

// Exercise the real session store so a failed check cannot authorize a poll.
let useLiveRefresh: (typeof LiveRefreshModule)['useLiveRefresh'];
let session: typeof SessionModule;
const user = { userId: 'u1', gymId: 'g1', role: 'OWNER' as const };
const fetchSession = vi.fn<typeof fetch>();

function visible(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', { configurable: true, value: hidden });
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  refresh.mockClear();
  fetchSession.mockReset();
  vi.stubGlobal('fetch', fetchSession);
  visible(false);
  session = await import('./use-session');
  ({ useLiveRefresh } = await import('./use-live-refresh'));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useLiveRefresh', () => {
  it('renews an expired session before refreshing the route', async () => {
    fetchSession.mockResolvedValueOnce(Response.json({ user, accessExpiresAt: Date.now() - 1 }));
    await session.ensureSessionChecked();
    expect(session.isSessionUsable()).toBe(false);
    let finish!: (value: Response) => void;
    fetchSession.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    renderHook(() => useLiveRefresh(1000));
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(refresh).not.toHaveBeenCalled();
    await act(async () => {
      finish(Response.json({ user, accessExpiresAt: Date.now() + 60_000 }));
      await session.ensureSessionChecked();
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(session.isSessionUsable()).toBe(true);
  });

  it.each(['network', 'recoverable', 'server'])(
    'skips refresh after a %s failure',
    async (failure) => {
      fetchSession.mockResolvedValueOnce(Response.json({ user }));
      await session.ensureSessionChecked();
      if (failure === 'network') fetchSession.mockRejectedValueOnce(new Error('offline'));
      else
        fetchSession.mockResolvedValueOnce(
          failure === 'recoverable'
            ? Response.json({ user: null, recoverable: true })
            : new Response(null, { status: 503 }),
        );
      renderHook(() => useLiveRefresh(1000));
      await act(() => vi.advanceTimersByTimeAsync(1000));
      expect(refresh).not.toHaveBeenCalled();
      expect(session.isSessionUsable()).toBe(false);
    },
  );

  it('does no work in a hidden tab, then checks before catching up', async () => {
    visible(true);
    fetchSession.mockResolvedValue(Response.json({ user }));
    renderHook(() => useLiveRefresh(1000));
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(fetchSession).not.toHaveBeenCalled();
    await act(async () => {
      visible(false);
      await session.ensureSessionChecked();
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('does not refresh after becoming hidden or unmounting during renewal', async () => {
    let finish!: (value: Response) => void;
    fetchSession.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    const { unmount } = renderHook(() => useLiveRefresh(1000));
    await act(() => vi.advanceTimersByTimeAsync(1000));
    visible(true);
    unmount();
    await act(async () => {
      finish(Response.json({ user }));
      await session.ensureSessionChecked();
    });
    expect(refresh).not.toHaveBeenCalled();
  });
});
