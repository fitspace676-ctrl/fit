import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

/**
 * Locale-aware navigation primitives. Use these instead of the equivalents
 * from `next/link` / `next/navigation` for every internal route, so links and
 * redirects keep the `/ka` prefix on the Georgian site and drop it on the
 * English one automatically.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
