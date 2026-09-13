import { describe, expect, it } from 'vitest';
import { loginGymSlug } from './login-gym-slug';

describe('loginGymSlug', () => {
  it('binds a sign-in on a tenant host to that gym', () => {
    expect(loginGymSlug('downtown.formacore.io', 'formacore.io')).toBe('downtown');
    expect(loginGymSlug('downtown.localhost:3001', 'localhost')).toBe('downtown');
  });

  it('names no gym on the console’s own Vercel deployment', () => {
    // The bug: the first label (`fit-admin-git-main`) was sent as the slug.
    expect(loginGymSlug('fit-admin-git-main-formacore.vercel.app', 'formacore.io')).toBeUndefined();
  });

  it('names no gym on platform hosts and the apex', () => {
    expect(loginGymSlug('app.formacore.io', 'formacore.io')).toBeUndefined();
    expect(loginGymSlug('www.formacore.io', 'formacore.io')).toBeUndefined();
    expect(loginGymSlug('formacore.io', 'formacore.io')).toBeUndefined();
    expect(loginGymSlug('localhost:3002', 'localhost')).toBeUndefined();
  });

  it('names no gym when no root domain is configured', () => {
    expect(loginGymSlug('downtown.formacore.io', undefined)).toBeUndefined();
  });
});
