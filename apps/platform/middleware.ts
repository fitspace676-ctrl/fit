import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from '@/src/i18n/routing';

/**
 * Locale routing for the marketing site: `/`, `/pricing`, … serve English,
 * `/ka`, `/ka/pricing`, … serve Georgian. An explicit `/en/...` is redirected
 * to its unprefixed form so each page has one canonical URL per language.
 */
const intl = createMiddleware(routing);

/** The country Vercel's edge resolved from the visitor's IP (ISO 3166-1 alpha-2). */
export const COUNTRY_HEADER = 'x-vercel-ip-country';
/** Written by the language switcher; `en` means the visitor chose English. */
export const LOCALE_COOKIE = 'NEXT_LOCALE';

/**
 * Search engines and link-preview bots always get the page the URL names, so the
 * English pages stay crawlable and shareable from a Georgian IP too.
 */
const BOT =
  /bot|crawl|spider|slurp|facebookexternalhit|facebookcatalog|embedly|whatsapp|telegram|skype|vkshare|pinterest|lighthouse|preview/i;

/**
 * Where a visitor from Georgia should go instead of an English page, or `null`
 * to serve the URL as asked. Only unprefixed (English) page URLs are moved, and
 * never once the visitor has picked English with the switcher. Elsewhere, and
 * when the edge sends no country (local dev), the URL decides as before.
 */
export function georgianRedirect(request: NextRequest): URL | null {
  if (request.method !== 'GET' && request.method !== 'HEAD') return null;
  if (request.headers.get(COUNTRY_HEADER)?.toUpperCase() !== 'GE') return null;
  if (BOT.test(request.headers.get('user-agent') ?? '')) return null;
  if (request.cookies.get(LOCALE_COOKIE)?.value === 'en') return null;

  const { pathname, search } = request.nextUrl;
  const first = pathname.split('/')[1] ?? '';
  if ((routing.locales as readonly string[]).includes(first)) return null;
  if (pathname.includes('.')) return null; // feeds and other files

  const target = request.nextUrl.clone();
  target.pathname = pathname === '/' ? '/ka' : `/ka${pathname}`;
  target.search = search;
  return target;
}

export default function middleware(request: NextRequest) {
  const target = georgianRedirect(request);
  const response = target ? NextResponse.redirect(target, 307) : intl(request);
  // The answer to an English URL depends on these, so no cache may share it.
  response.headers.append('Vary', `${COUNTRY_HEADER}, Cookie, User-Agent`);
  return response;
}

export const config = {
  // Run on every route except API handlers, Next.js internals and files.
  matcher: [
    '/resources/feed.xml',
    '/:locale/resources/feed.xml',
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)',
  ],
};
