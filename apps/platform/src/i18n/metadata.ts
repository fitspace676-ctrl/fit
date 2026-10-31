import type { Metadata } from 'next';

/**
 * The `alternates` block every page's metadata carries: the English URL is the
 * unprefixed one (and the `x-default`), the Georgian one sits under `/ka`.
 * Paths are relative; `metadataBase` in the locale layout makes them absolute.
 */
export function localeAlternates(path: string): NonNullable<Metadata['alternates']> {
  const en = path;
  const ka = path === '/' ? '/ka' : `/ka${path}`;
  return { languages: { en, ka, 'x-default': en } };
}
