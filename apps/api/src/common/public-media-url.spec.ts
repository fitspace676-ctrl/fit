import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockEnv } = vi.hoisted(() => {
  const mockEnv: Record<string, unknown> = {};
  return { mockEnv };
});
vi.mock('../config/env', () => ({ env: mockEnv }));

import { resolvePublicMediaUrl, toPublicMediaUrl } from './public-media-url';

const origins = {
  gymSlug: 'downtown',
  rootDomain: 'formacore.io',
  webUrl: 'https://app.formacore.io',
};

describe('resolvePublicMediaUrl', () => {
  it("joins a root-relative path onto the gym's tenant host", () => {
    expect(resolvePublicMediaUrl('/gym-hero.webp', origins)).toBe(
      'https://downtown.formacore.io/gym-hero.webp',
    );
  });

  it('uses http for a localhost dev root, keeping its port', () => {
    expect(
      resolvePublicMediaUrl('/gym-hero.webp', {
        gymSlug: 'downtown',
        rootDomain: 'localhost:3001',
      }),
    ).toBe('http://downtown.localhost:3001/gym-hero.webp');
  });

  it('passes an absolute http(s) URL through untouched', () => {
    const r2 = 'https://pub-123.r2.dev/gym-1/locations/main.webp';
    expect(resolvePublicMediaUrl(r2, origins)).toBe(r2);
    expect(resolvePublicMediaUrl('http://cdn.example.com/a.jpg', origins)).toBe(
      'http://cdn.example.com/a.jpg',
    );
  });

  it('maps null, undefined and blank to null', () => {
    expect(resolvePublicMediaUrl(null, origins)).toBeNull();
    expect(resolvePublicMediaUrl(undefined, origins)).toBeNull();
    expect(resolvePublicMediaUrl('', origins)).toBeNull();
    expect(resolvePublicMediaUrl('   ', origins)).toBeNull();
  });

  it('falls back to WEB_URL when there is no tenant origin', () => {
    const noTenant = {
      gymSlug: null,
      rootDomain: 'formacore.io',
      webUrl: 'https://app.formacore.io/',
    };
    expect(resolvePublicMediaUrl('/gym-hero.webp', noTenant)).toBe(
      'https://app.formacore.io/gym-hero.webp',
    );
    expect(
      resolvePublicMediaUrl('/gym-hero.webp', { ...noTenant, gymSlug: 'downtown', rootDomain: '' }),
    ).toBe('https://app.formacore.io/gym-hero.webp');
  });

  it('returns null for a relative path when neither origin is available', () => {
    expect(resolvePublicMediaUrl('/gym-hero.webp', {})).toBeNull();
    expect(
      resolvePublicMediaUrl('/gym-hero.webp', {
        gymSlug: 'downtown',
        rootDomain: null,
        webUrl: ' ',
      }),
    ).toBeNull();
  });

  it('maps any other value to null', () => {
    for (const junk of ['gym-hero.webp', '//evil.example/x.jpg', 'ftp://host/x.jpg', 'data:x']) {
      expect(resolvePublicMediaUrl(junk, origins)).toBeNull();
    }
  });
});

describe('toPublicMediaUrl', () => {
  afterEach(() => {
    for (const key of Object.keys(mockEnv)) delete mockEnv[key];
  });

  it('reads PLATFORM_ROOT_DOMAIN and WEB_URL from config', () => {
    Object.assign(mockEnv, {
      PLATFORM_ROOT_DOMAIN: 'formacore.io',
      WEB_URL: 'https://app.formacore.io',
    });
    expect(toPublicMediaUrl('/gym-hero.webp', 'downtown')).toBe(
      'https://downtown.formacore.io/gym-hero.webp',
    );
    expect(toPublicMediaUrl('/gym-hero.webp')).toBe('https://app.formacore.io/gym-hero.webp');
  });
});
