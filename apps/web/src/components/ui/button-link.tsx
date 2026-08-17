'use client';

import { buttonSurfaceProps, ButtonContent, type ButtonLinkProps } from '@fit/ui-kit';
import { Link } from '@/src/i18n/navigation';

/**
 * A button that navigates. Same silhouette as `Button`, an `<a>` underneath.
 *
 * `@fit/ui-kit` deliberately does not ship this: a navigating button needs a
 * `Link`, and the two apps do not share one — the portal routes through
 * next-intl's locale-aware `Link` (it prefixes `/ka` / `/en`) while the console
 * uses plain `next/link`. The package ships the surface and the content
 * arrangement; this binds the portal's router to them.
 *
 * It is a component rather than a polymorphic `as` prop because a *component*
 * cannot cross the server→client boundary: React serializes only plain data, so
 * a Server Component writing `<Button as={Link}>` throws "Functions cannot be
 * passed directly to Client Components" and the page 500s. Keeping `Link` on
 * this side of the boundary makes the pairing a client-side detail, and server
 * callers pass nothing but serializable props — which is what the dashboard, the
 * class grid and the shop all do.
 *
 * This file carries the `'use client'`, NOT the `kit` barrel beside it. Putting
 * it on the barrel would mark every re-export a client component, and the kit's
 * presentational half (`Card`, `Badge`, `Avatar`, `EmptyState`, `Meter`) is
 * server-safe on purpose — the dashboard is a Server Component and renders them
 * without shipping their JS.
 */
export function ButtonLink({
  href,
  label,
  children,
  variant,
  size,
  icon,
  iconOnly = false,
  endContent,
  fullWidth,
  xstyle,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link
      href={href}
      aria-label={iconOnly ? label : undefined}
      {...rest}
      {...buttonSurfaceProps({ variant, size, iconOnly, fullWidth, xstyle })}
    >
      <ButtonContent label={label} icon={icon} iconOnly={iconOnly} endContent={endContent}>
        {children}
      </ButtonContent>
    </Link>
  );
}
