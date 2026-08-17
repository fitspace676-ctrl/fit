// @fit/web — the portal's utility surface.
//
// THE COMPONENTS LIVE IN `./kit` NOW. This barrel used to re-export the whole
// `@fit/ui-web` primitive set — `Btn`, `Field`, `Input`, `Select`, `Tabs`,
// `Modal`, `Drawer`, `ConfirmDialog` and their class helpers — as the member
// portal's design system. Every one of those is FormaCore-authored in `./kit`
// today, and nothing in the portal imported the Tailwind originals any more, so
// they are gone rather than sitting here as a second answer to "which Button?".
//
// What is left is the genuinely shared, non-visual furniture: the icon set, the
// toast channel, the skip link, and the check-in QR block.
//
// The three names still coming from `@fit/ui-web` below — `Card`, `Badge` and
// `buttonClasses` — are held for `app/[locale]/_components/*`, the MARKETING
// pages, which are a separate surface on their own Tailwind skin and out of the
// member portal's migration. They retire when that surface does.

export { Icon, I, type IconName } from './icon';
export { SkipLink } from './primitives';
export { QRCode } from './qr-code';
export { ToastProvider, useToast } from './toast';

/* -------------------------------------------------------------------------- */
/*  Marketing-only (apps/web/app/[locale]/_components) — not for the portal     */
/* -------------------------------------------------------------------------- */

export { buttonClasses } from './button';
export { Badge } from './badge';
export { Card } from './primitives';
