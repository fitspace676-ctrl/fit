/**
 * The member portal's view of `@fit/ui-kit`.
 *
 * Deliberately NOT a `'use client'` module: the kit's presentational half
 * (`Card`, `Badge`, `Avatar`, `EmptyState`, `Meter`) is server-safe, the
 * dashboard is a Server Component that renders it, and marking this barrel
 * client would drag all of it into the browser bundle. The package's own files
 * carry the directive where they need it.
 *
 * Everything visual comes straight from the package. The one addition is
 * `ButtonLink`, which needs a router the package cannot pick for both apps —
 * see `./button-link`.
 *
 * Screens keep importing from `@/src/components/ui/kit`, unchanged: the kit
 * moving into a package is invisible to them.
 */

export * from '@fit/ui-kit';
export { ButtonLink } from './button-link';
