'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import type { StyleXStyles } from '@stylexjs/stylex';
import {
  ButtonContent,
  buttonSurfaceProps,
  type ButtonSize,
  type ButtonVariant,
} from '@fit/ui-kit';

/**
 * A `next/link` wearing the kit's button surface.
 *
 * `@fit/ui-kit` deliberately ships no `ButtonLink` — the apps route differently,
 * so each builds its own from `buttonSurfaceProps` + `ButtonContent`. This is
 * that build for the operator console.
 *
 * It has to be a Client Component even though it renders no state:
 * `buttonSurfaceProps` lives in the kit's `'use client'` module, so calling it
 * from a Server Component fails at render ("attempted to call … from the
 * server"). Keeping the call on this side of the boundary lets server-rendered
 * pages use it as an ordinary element.
 */
export function ButtonLink({
  href,
  label,
  children,
  variant = 'primary',
  size = 'card',
  icon,
  xstyle,
}: {
  href: string;
  label: string;
  children?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  xstyle?: StyleXStyles;
}) {
  return (
    <Link href={href} {...buttonSurfaceProps({ variant, size, xstyle })}>
      <ButtonContent label={label} icon={icon}>
        {children}
      </ButtonContent>
    </Link>
  );
}
