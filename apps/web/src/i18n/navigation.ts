import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

/**
 * Locale-aware navigation primitives. Use these instead of the equivalents
 * from `next/link` / `next/navigation` so links and redirects keep the active
 * locale prefix (`/ka/...`, `/en/...`) automatically.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
