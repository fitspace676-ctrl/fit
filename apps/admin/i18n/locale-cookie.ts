/**
 * The cookie the active locale is persisted under. Shared with @fit/web so a
 * language choice made in the member portal carries into the console. Kept in
 * its own module (no `next/headers`) so both the server request config and the
 * client language switcher can import it without pulling server-only code into
 * the client bundle.
 */
export const LOCALE_COOKIE = 'NEXT_LOCALE';
