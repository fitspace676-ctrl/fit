import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import middleware, { COUNTRY_HEADER, LOCALE_COOKIE, georgianRedirect } from './middleware';

function request(path: string, init: { country?: string; cookie?: string; method?: string } = {}) {
  const headers = new Headers();
  if (init.country) headers.set(COUNTRY_HEADER, init.country);
  if (init.cookie) headers.set('cookie', `${LOCALE_COOKIE}=${init.cookie}`);
  return new NextRequest(new URL(path, 'https://formacore.io'), {
    headers,
    method: init.method ?? 'GET',
  });
}

describe('georgianRedirect', () => {
  it('sends a visitor from Georgia to the Georgian page, keeping path and query', () => {
    expect(georgianRedirect(request('/', { country: 'GE' }))?.pathname).toBe('/ka');
    const target = georgianRedirect(request('/pricing?plan=club', { country: 'ge' }));
    expect(target?.pathname).toBe('/ka/pricing');
    expect(target?.search).toBe('?plan=club');
  });

  it('serves English to visitors from anywhere else, and when no country is known', () => {
    expect(georgianRedirect(request('/', { country: 'US' }))).toBeNull();
    expect(georgianRedirect(request('/pricing', { country: 'DE' }))).toBeNull();
    expect(georgianRedirect(request('/'))).toBeNull();
  });

  it('respects a visitor from Georgia who chose English', () => {
    expect(georgianRedirect(request('/', { country: 'GE', cookie: 'en' }))).toBeNull();
    expect(georgianRedirect(request('/', { country: 'GE', cookie: 'ka' }))?.pathname).toBe('/ka');
  });

  it('leaves Georgian pages, files and non-page requests alone', () => {
    expect(georgianRedirect(request('/ka/pricing', { country: 'GE' }))).toBeNull();
    expect(georgianRedirect(request('/resources/feed.xml', { country: 'GE' }))).toBeNull();
    expect(georgianRedirect(request('/', { country: 'GE', method: 'POST' }))).toBeNull();
  });
});

describe('middleware', () => {
  it('answers a visitor from Georgia with a temporary redirect to /ka', () => {
    const response = middleware(request('/built-for', { country: 'GE' }));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://formacore.io/ka/built-for');
  });

  it('hands everyone else to the locale routing', () => {
    const response = middleware(request('/built-for', { country: 'US' }));
    expect(response.headers.get('location')).toBeNull();
  });
});
