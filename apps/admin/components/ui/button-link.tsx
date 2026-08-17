'use client';

import NextLink from 'next/link';
import { buttonSurfaceProps, ButtonContent, type ButtonLinkProps } from '@fit/ui-kit';

/**
 * A button that navigates. Same silhouette as the kit's `Button`, an `<a>`
 * underneath.
 *
 * `@fit/ui-kit` deliberately does not ship this: a navigating button needs a
 * `Link`, and the two apps do not share one — the member portal routes through
 * next-intl's locale-aware `Link` (it prefixes `/ka` / `/en`) while the console
 * keeps its locale in a cookie and uses plain `next/link`. The package ships the
 * surface and the content arrangement; this binds the console's router to them.
 *
 * It replaces `buttonClasses()`, the Tailwind recipe seven console screens were
 * calling to paint an `<a>` like a button. That helper produced a string of
 * utility classes, so a link-button could never pick up the kit's sizes, hover
 * or focus ring — the two drifted apart the moment either changed.
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
    <NextLink
      href={href}
      aria-label={iconOnly ? label : undefined}
      {...rest}
      {...buttonSurfaceProps({ variant, size, iconOnly, fullWidth, xstyle })}
    >
      <ButtonContent label={label} icon={icon} iconOnly={iconOnly} endContent={endContent}>
        {children}
      </ButtonContent>
    </NextLink>
  );
}
