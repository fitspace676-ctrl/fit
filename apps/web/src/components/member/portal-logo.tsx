import * as stylex from '@stylexjs/stylex';
import type { PortalLogoSize } from '@fit/types';

/**
 * The mark in the member portal's chrome — the tenant's own, or the bundled
 * FormaCore wordmark when it has none.
 *
 * ONE COMPONENT FOR THREE HEADERS. The join wizard's bar, the sign-in shell (both
 * its photo panel and its phone-width header) and the signed-in portal header all
 * drew the wordmark inline, which meant three copies of a decision that has to be
 * identical everywhere. It is one now, because the tenant case has a constraint
 * the bundled case does not, and three places is three chances to get it wrong.
 *
 * ═══ THE PROBLEM THIS EXISTS TO SOLVE ═══
 *
 * The bundled wordmark is a PAIR: `logodark.png` is white-inked for dark grounds,
 * `logolight.png` dark-inked for light ones, and `.member-logo-dark` /
 * `.member-logo-light` in `globals.css` swap between them off the `.dark` class.
 * That works because two files exist.
 *
 * A GYM UPLOADS ONE FILE. Dropping it into that swap would render the same image
 * in both slots, which is not a swap — it is a coin toss the gym did not call:
 *
 *   · the sign-in panel sits on a dark photograph under a dark scrim, in BOTH
 *     themes (see `AuthPhotoShell`), so a dark-inked mark disappears there;
 *   · the signed-in header and the join header follow the light/dark canvas, so a
 *     white-inked mark disappears on the light one.
 *
 * There is no single ink that survives all three grounds, so the ground is what
 * changes instead.
 *
 * ═══ THE ANSWER: THE GYM'S FILE, AS UPLOADED ═══
 *
 * A tenant logo is drawn exactly as the gym uploaded it, with no plate or chip
 * behind it, the same file on every surface. Choosing a mark that reads on the
 * grounds it lands on is the gym's call: the console's upload hint says the logo
 * is shown as is, over the sign-in photograph and on the light and dark headers,
 * and its live preview draws it over the photograph so a mark that disappears
 * there is caught before a member sees it. (An earlier version put every tenant
 * mark on a fixed white plate; gyms read the plate as a stray white box.)
 *
 * ═══ THE FALLBACK KEEPS THE SWAP ═══
 *
 * When there is no tenant mark, the bundled pair renders exactly as it did before
 * this component existed: the `.member-logo` theme swap on the two themed
 * surfaces, and the white-inked file alone over the photograph, where the scrim is
 * dark in both themes.
 *
 * ═══ THE SIZE IS THE GYM'S, WITHIN BOUNDS WE CHOSE ═══
 *
 * `memberPortal.logoSize` picks one of three presets, and each preset is a pair
 * of bounds per surface rather than a number the gym types, so no setting can
 * push a header out of shape. The headers are a fixed 5rem bar, so their bounds
 * stay well inside it; the photograph has room to spare, so its bounds are
 * larger. `sm` is the size every tenant mark had before the setting existed.
 * The bundled wordmark ignores the preset: it is FormaCore's mark, its file
 * carries generous transparent padding that already fills most of the bar, and
 * the setting is for the gym's own logo.
 */

const styles = stylex.create({
  /**
   * The bundled wordmark over the sign-in photograph — always the white-inked
   * file, no theme swap, because the scrim is dark in both modes. The dimensions
   * mirror `.member-logo` in `globals.css` so the bundled mark is the same size
   * whichever of the two paths draws it.
   */
  bundledOnPhoto: {
    width: '9.25rem',
    height: 'auto',
    maxWidth: '100%',
    objectFit: 'contain',
  },
  /**
   * The uploaded file, drawn straight onto the surface.
   *
   * Bounded on BOTH axes and never stretched: a gym's mark may be a wide wordmark
   * or a square badge, and the header has to survive either without the bar
   * growing. `objectFit: contain` with `auto` on both dimensions means the file's
   * own aspect ratio decides which bound it meets first.
   */
  tenantMark: {
    display: 'block',
    width: 'auto',
    height: 'auto',
    objectFit: 'contain',
  },
  // ── the presets on the themed headers (join, sign-in on a phone, signed in) ──
  // Each height leaves the 5rem bar at least 1.75rem of air. Below 640px the
  // width is also capped by the viewport: the theme and language switches take
  // about 16rem of a phone-width bar with its padding, so on a 390px screen a
  // wide wordmark gets what is left rather than pushing the switches off the
  // edge (which even the original 9.25rem did). A compact mark is bounded by
  // its height first, so the three presets still differ there.
  headerSm: {
    maxHeight: '2.25rem',
    maxWidth: {
      default: 'min(9.25rem, calc(100vw - 16rem))',
      '@media (min-width: 640px)': '9.25rem',
    },
  },
  headerMd: {
    maxHeight: '2.75rem',
    maxWidth: {
      default: 'min(10rem, calc(100vw - 16rem))',
      '@media (min-width: 640px)': '11.25rem',
    },
  },
  headerLg: {
    maxHeight: '3.25rem',
    maxWidth: {
      default: 'min(11rem, calc(100vw - 16rem))',
      '@media (min-width: 640px)': '13.5rem',
    },
  },
  // ── the presets over the sign-in photograph (from `lg`, where it is a column) ──
  photoSm: { maxHeight: '2.25rem', maxWidth: '9.25rem' },
  photoMd: { maxHeight: '3.5rem', maxWidth: '14.5rem' },
  photoLg: { maxHeight: '4.5rem', maxWidth: '18.5rem' },
});

const HEADER_SIZES = { sm: styles.headerSm, md: styles.headerMd, lg: styles.headerLg } as const;
const PHOTO_SIZES = { sm: styles.photoSm, md: styles.photoMd, lg: styles.photoLg } as const;

export interface PortalLogoProps {
  /**
   * The tenant's mark, already resolved by the API through
   * `memberPortal.logoUrl ?? brand.logoUrl`, or `null` for "this gym has uploaded
   * no mark" — which is the bundled wordmark's case.
   */
  logoUrl: string | null;
  /**
   * True where the mark sits on the sign-in panel's photograph rather than on a
   * themed surface. It changes only the BUNDLED rendering; a tenant mark is the
   * one uploaded file, the same everywhere.
   */
  onPhoto?: boolean;
  /** The gym's size preset (`memberPortal.logoSize`); tenant marks only. */
  size?: PortalLogoSize;
}

/**
 * Render the portal's mark. Decorative by contract: every call site wraps this in
 * a link that already carries the accessible name, so a second announcement here
 * would read the brand twice.
 */
export function PortalLogo({ logoUrl, onPhoto = false, size = 'md' }: PortalLogoProps) {
  if (logoUrl) {
    const bounds = (onPhoto ? PHOTO_SIZES : HEADER_SIZES)[size];
    return <img src={logoUrl} alt="" {...stylex.props(styles.tenantMark, bounds)} />;
  }

  if (onPhoto) {
    return <img src="/logodark.png" alt="" {...stylex.props(styles.bundledOnPhoto)} />;
  }

  // The bundled pair, swapped by `globals.css` off the `.dark` class the theme
  // provider stamps on <html>. Global CSS rather than StyleX because the swap
  // needs a descendant selector, which StyleX has no way to express.
  return (
    <>
      <img src="/logodark.png" alt="" className="member-logo member-logo-dark" />
      <img src="/logolight.png" alt="" className="member-logo member-logo-light" />
    </>
  );
}
