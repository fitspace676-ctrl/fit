import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isGymSelectionRequired,
  loginWithApple,
  loginWithCredentials,
  loginWithGoogle,
  resetPassword,
  SignInError,
  signInErrorKey,
} from './auth';

let fetchMock: ReturnType<typeof vi.fn<(url: string, init?: RequestInit) => Promise<Response>>>;

const reply = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status });

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_ROOT_DOMAIN', 'formacore.io');
  vi.stubEnv('NEXT_PUBLIC_DEV_GYM_SLUG', '');
  // The browser page the form runs on.
  vi.stubGlobal('window', { location: { host: 'riverside.formacore.io' } });
  fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(() =>
    Promise.resolve(reply({})),
  );
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('resetPassword', () => {
  it("names the page's gym host and stores an issued session", async () => {
    fetchMock.mockResolvedValueOnce(
      reply({ accessToken: 'a', refreshToken: 'r', sessionIssued: true }),
    );

    const result = await resetPassword('tok', 'brand-new-secret');

    expect(result).toEqual({ accessToken: 'a', refreshToken: 'r', sessionIssued: true });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://localhost:3000/auth/reset-password');
    expect(new Headers(init?.headers).get('x-tenant-host')).toBe('riverside.formacore.io');
    expect(JSON.parse(init?.body as string)).toEqual({
      token: 'tok',
      password: 'brand-new-secret',
    });

    const [sessionUrl, sessionInit] = fetchMock.mock.calls[1]!;
    expect(sessionUrl).toBe('/api/session');
    expect(JSON.parse(sessionInit?.body as string)).toEqual({
      accessToken: 'a',
      refreshToken: 'r',
    });
  });

  it('stores nothing when the API issued no session on this gym', async () => {
    fetchMock.mockResolvedValueOnce(reply({ ok: true, sessionIssued: false }));

    const result = await resetPassword('tok', 'brand-new-secret');

    expect(result).toEqual({ ok: true, sessionIssued: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws the API's message on a rejected token", async () => {
    fetchMock.mockResolvedValueOnce(
      reply({ message: 'Reset token is invalid or has expired' }, 400),
    );

    await expect(resetPassword('tok', 'brand-new-secret')).rejects.toThrow(
      'Reset token is invalid or has expired',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('social sign-in', () => {
  it("sends the page's gym with a Google sign-in", async () => {
    fetchMock.mockResolvedValueOnce(reply({ accessToken: 'a', refreshToken: 'r' }));

    await loginWithGoogle('google-token');

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://localhost:3000/auth/google');
    expect(new Headers(init?.headers).get('x-tenant-host')).toBe('riverside.formacore.io');
    expect(JSON.parse(init?.body as string)).toEqual({
      idToken: 'google-token',
      gymSlug: 'riverside',
    });
  });

  it("sends the page's gym with an Apple sign-in", async () => {
    fetchMock.mockResolvedValueOnce(reply({ accessToken: 'a', refreshToken: 'r' }));

    await loginWithApple('apple-token', 'Alice');

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://localhost:3000/auth/apple');
    expect(JSON.parse(init?.body as string)).toEqual({
      idToken: 'apple-token',
      name: 'Alice',
      gymSlug: 'riverside',
    });
  });

  it('names no gym off a tenant host', async () => {
    vi.stubGlobal('window', { location: { host: 'app.formacore.io' } });
    fetchMock.mockResolvedValueOnce(reply({ accessToken: 'a', refreshToken: 'r' }));

    await loginWithGoogle('google-token');

    const [, init] = fetchMock.mock.calls[0]!;
    expect(JSON.parse(init?.body as string)).toEqual({ idToken: 'google-token' });
  });
});

describe('a refused sign-in', () => {
  it("carries the API's code and stores nothing", async () => {
    fetchMock.mockResolvedValueOnce(
      reply({ message: 'This account is not a member of this gym', code: 'NOT_A_MEMBER' }, 403),
    );

    const error = await loginWithGoogle('google-token').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(SignInError);
    expect((error as SignInError).code).toBe('NOT_A_MEMBER');
    expect((error as SignInError).message).toBe('This account is not a member of this gym');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('carries the code on a credentials sign-in too', async () => {
    fetchMock.mockResolvedValueOnce(
      reply({ message: 'not active', code: 'MEMBERSHIP_NOT_ACTIVE' }, 403),
    );

    const error = await loginWithCredentials('a@b.com', 'secret').catch((e: unknown) => e);

    expect(signInErrorKey(error)).toBe('login.errors.membershipNotActive');
  });

  it('maps each refusal with its own copy to a message key', () => {
    expect(signInErrorKey(new SignInError('x', 'NOT_A_MEMBER'))).toBe('login.errors.notAMember');
    expect(signInErrorKey(new SignInError('x', 'MEMBERSHIP_NOT_ACTIVE'))).toBe(
      'login.errors.membershipNotActive',
    );
    expect(signInErrorKey(new SignInError('x', 'GYM_SUSPENDED'))).toBe('login.errors.gymSuspended');
  });

  it("leaves everything else to the API's message", () => {
    expect(signInErrorKey(new SignInError('x', 'INVALID_CREDENTIALS'))).toBeNull();
    expect(signInErrorKey(new SignInError('x'))).toBeNull();
    expect(signInErrorKey(new Error('x'))).toBeNull();
  });
});

describe('a sign-in the API needs a gym for', () => {
  const selection = {
    message: 'This password signs you in to more than one gym — choose one',
    code: 'GYM_SELECTION_REQUIRED',
    data: {
      gyms: [
        { slug: 'downtown', name: 'Downtown' },
        { slug: 'riverside', name: 'Riverside' },
      ],
    },
  };

  it('carries the gyms the password unlocked', async () => {
    vi.stubGlobal('window', { location: { host: 'app.formacore.io' } });
    fetchMock.mockResolvedValueOnce(reply(selection, 409));

    const error = await loginWithCredentials('a@b.com', 'secret').catch((e: unknown) => e);

    expect(isGymSelectionRequired(error)).toBe(true);
    expect((error as SignInError).gyms).toEqual(selection.data.gyms);
    // Off a tenant host the first attempt named no gym.
    const [, init] = fetchMock.mock.calls[0]!;
    expect(JSON.parse(init?.body as string)).toEqual({ email: 'a@b.com', password: 'secret' });
  });

  it('signs in again naming the gym the visitor picked', async () => {
    vi.stubGlobal('window', { location: { host: 'app.formacore.io' } });
    fetchMock.mockResolvedValueOnce(reply({ accessToken: 'a', refreshToken: 'r' }));

    await loginWithCredentials('a@b.com', 'secret', undefined, 'riverside');

    const [, init] = fetchMock.mock.calls[0]!;
    expect(JSON.parse(init?.body as string)).toEqual({
      email: 'a@b.com',
      password: 'secret',
      gymSlug: 'riverside',
    });
  });

  it("never lets a picked gym override the page's own", async () => {
    fetchMock.mockResolvedValueOnce(reply({ accessToken: 'a', refreshToken: 'r' }));

    await loginWithCredentials('a@b.com', 'secret', undefined, 'downtown');

    const [, init] = fetchMock.mock.calls[0]!;
    expect(JSON.parse(init?.body as string)).toMatchObject({ gymSlug: 'riverside' });
  });

  it('is not a selection when the 409 carries no gyms', async () => {
    fetchMock.mockResolvedValueOnce(reply({ message: 'x', code: 'GYM_SELECTION_REQUIRED' }, 409));

    const error = await loginWithCredentials('a@b.com', 'secret').catch((e: unknown) => e);

    expect(isGymSelectionRequired(error)).toBe(false);
    expect((error as SignInError).gyms).toEqual([]);
  });
});
