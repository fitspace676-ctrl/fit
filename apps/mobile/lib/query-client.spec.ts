import { afterEach, describe, expect, it, vi } from 'vitest';
import { focusManager, onlineManager } from '@tanstack/react-query';
import { ApiError } from './http/api-error';
import {
  MAX_QUERY_ATTEMPTS,
  createQueryClient,
  isOnlineFromNetInfo,
  retryDelay,
  shouldRetry,
  wireQueryBridges,
  type AppStateLike,
  type NetInfoLike,
} from './query-client';

describe('shouldRetry', () => {
  it('never retries a 4xx', () => {
    // A 403 will never become a 200 — the caller lacks the permission. A 404
    // will never become a 200 either.
    for (const status of [400, 401, 403, 404, 409, 422]) {
      expect(shouldRetry(0, new ApiError({ status }))).toBe(false);
    }
  });

  it('never retries a 429 — retrying a rate limit amplifies it', () => {
    // apps/api's RateLimitGuard answers 429 + Retry-After; three blind attempts
    // turn a short cool-down into a longer one.
    expect(
      shouldRetry(0, new ApiError({ status: 429, code: 'RATE_LIMITED', retryAfterSec: 12 })),
    ).toBe(false);
  });

  it('retries a 5xx and a transport failure, up to the attempt cap', () => {
    expect(shouldRetry(0, new ApiError({ status: 503 }))).toBe(true);
    expect(shouldRetry(1, new ApiError({ status: 0, code: 'NETWORK_TIMEOUT' }))).toBe(true);
    expect(shouldRetry(MAX_QUERY_ATTEMPTS - 1, new ApiError({ status: 503 }))).toBe(false);
  });

  it('retries an unrecognised error — it may be a transient throw', () => {
    expect(shouldRetry(0, new Error('boom'))).toBe(true);
    expect(shouldRetry(0, undefined)).toBe(true);
  });

  it('backs off exponentially with a cap', () => {
    expect([0, 1, 2, 3, 10].map(retryDelay)).toEqual([1000, 2000, 4000, 8000, 8000]);
  });
});

describe('createQueryClient', () => {
  it('does not retry mutations — a retried checkout is a second order', () => {
    const client = createQueryClient();
    expect(client.getDefaultOptions().mutations?.retry).toBe(false);
  });

  it('installs the retry policy on queries', () => {
    const client = createQueryClient();
    expect(client.getDefaultOptions().queries?.retry).toBe(shouldRetry);
    expect(client.getDefaultOptions().queries?.refetchOnWindowFocus).toBe(true);
  });
});

describe('isOnlineFromNetInfo', () => {
  it('prefers isInternetReachable — a captive portal is "connected" and useless', () => {
    expect(isOnlineFromNetInfo({ isConnected: true, isInternetReachable: false })).toBe(false);
    expect(isOnlineFromNetInfo({ isConnected: false, isInternetReachable: true })).toBe(true);
  });

  it('assumes online while reachability is undetermined', () => {
    // Assuming offline before NetInfo has answered would block the first
    // request of every cold start behind a manager that never flips.
    expect(isOnlineFromNetInfo({ isConnected: true, isInternetReachable: null })).toBe(true);
    expect(isOnlineFromNetInfo({ isConnected: null })).toBe(true);
    expect(isOnlineFromNetInfo({ isConnected: false })).toBe(false);
  });
});

describe('wireQueryBridges', () => {
  const teardowns: (() => void)[] = [];

  afterEach(() => {
    for (const teardown of teardowns.splice(0)) {
      teardown();
    }
    // Leave the managers in their default state for other files.
    focusManager.setEventListener(() => undefined);
    onlineManager.setEventListener(() => undefined);
    focusManager.setFocused(true);
    onlineManager.setOnline(true);
  });

  /** A fake `AppState` returning the `{ remove }` subscription RN hands back. */
  function fakeAppState() {
    const listeners = new Set<(state: string) => void>();
    const removed = vi.fn();
    const appState: AppStateLike = {
      addEventListener: (_type, listener) => {
        listeners.add(listener);
        return {
          remove: () => {
            listeners.delete(listener);
            removed();
          },
        };
      },
    };
    return { appState, emit: (state: string) => listeners.forEach((l) => l(state)), removed };
  }

  /** A fake NetInfo returning the bare unsubscribe function it actually returns. */
  function fakeNetInfo() {
    type Listener = Parameters<NetInfoLike['addEventListener']>[0];
    const listeners = new Set<Listener>();
    const removed = vi.fn();
    const netInfo: NetInfoLike = {
      addEventListener: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
          removed();
        };
      },
    };
    return {
      netInfo,
      emit: (state: Parameters<Listener>[0]) => listeners.forEach((l) => l(state)),
      removed,
    };
  }

  it('drives focusManager from AppState — refetchOnWindowFocus is inert without it', () => {
    const app = fakeAppState();
    const net = fakeNetInfo();
    teardowns.push(wireQueryBridges({ appState: app.appState, netInfo: net.netInfo }));

    app.emit('background');
    expect(focusManager.isFocused()).toBe(false);
    app.emit('inactive');
    expect(focusManager.isFocused()).toBe(false);
    app.emit('active');
    expect(focusManager.isFocused()).toBe(true);
  });

  it('drives onlineManager from NetInfo — RN has no navigator.onLine', () => {
    const app = fakeAppState();
    const net = fakeNetInfo();
    teardowns.push(wireQueryBridges({ appState: app.appState, netInfo: net.netInfo }));

    net.emit({ isConnected: false, isInternetReachable: false });
    expect(onlineManager.isOnline()).toBe(false);
    net.emit({ isConnected: true, isInternetReachable: true });
    expect(onlineManager.isOnline()).toBe(true);
    // Connected to a captive-portal Wi-Fi: "connected", cannot reach the API.
    net.emit({ isConnected: true, isInternetReachable: false });
    expect(onlineManager.isOnline()).toBe(false);
  });

  it('tears both subscriptions down and stops responding', () => {
    // The managers keep the cleanup returned by the *setup* function and run it
    // when a new setup is installed — `setEventListener` itself returns void,
    // so a teardown that tried to call its result was both a type error and,
    // had it type-checked, a leak.
    const app = fakeAppState();
    const net = fakeNetInfo();
    const teardown = wireQueryBridges({ appState: app.appState, netInfo: net.netInfo });

    net.emit({ isConnected: true, isInternetReachable: true });
    app.emit('active');

    teardown();

    expect(app.removed).toHaveBeenCalledTimes(1);
    expect(net.removed).toHaveBeenCalledTimes(1);

    // The listeners are gone, so nothing further can move the managers.
    app.emit('background');
    net.emit({ isConnected: false, isInternetReachable: false });
    expect(focusManager.isFocused()).toBe(true);
    expect(onlineManager.isOnline()).toBe(true);
  });

  it('cleans up the previous wiring when re-wired', () => {
    const first = { app: fakeAppState(), net: fakeNetInfo() };
    wireQueryBridges({ appState: first.app.appState, netInfo: first.net.netInfo });

    const second = { app: fakeAppState(), net: fakeNetInfo() };
    teardowns.push(
      wireQueryBridges({ appState: second.app.appState, netInfo: second.net.netInfo }),
    );

    expect(first.app.removed).toHaveBeenCalledTimes(1);
    expect(first.net.removed).toHaveBeenCalledTimes(1);
  });
});
