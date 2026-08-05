'use client';

import { Button, type ButtonProps } from '@astryxdesign/core/Button';
import { Link } from '@/src/i18n/navigation';

/**
 * An Astryx `Button` that navigates — rendered polymorphically as next-intl's
 * locale-aware `Link`, so the href picks up the `/ka` / `/en` prefix.
 *
 * This exists as its own client component for one reason: a *component* cannot
 * cross the server→client boundary. React serializes only plain data, so a
 * Server Component writing `<Button as={Link} …>` throws "Functions cannot be
 * passed directly to Client Components" at render time — the page 500s. Keeping
 * `Button` and `Link` on the same side of the boundary makes the pairing a
 * client-side detail, and callers pass nothing but serializable props.
 *
 * Server Components should reach for this instead of `Button as={Link}`; the
 * `as` prop is deliberately not part of the surface.
 */
export type ButtonLinkProps = Omit<ButtonProps, 'as' | 'href'> & { href: string };

export function ButtonLink({ href, ...rest }: ButtonLinkProps) {
  return <Button as={Link} href={href} {...rest} />;
}
