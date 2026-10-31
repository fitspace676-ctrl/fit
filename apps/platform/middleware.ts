import createMiddleware from 'next-intl/middleware';
import { routing } from '@/src/i18n/routing';

/**
 * Locale routing for the marketing site: `/`, `/pricing`, … serve English,
 * `/ka`, `/ka/pricing`, … serve Georgian. An explicit `/en/...` is redirected
 * to its unprefixed form so each page has one canonical URL per language.
 */
export default createMiddleware(routing);

export const config = {
  // Run on every route except API handlers, Next.js internals and files.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
