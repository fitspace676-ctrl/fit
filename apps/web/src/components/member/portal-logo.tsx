import * as stylex from '@stylexjs/stylex';

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
 * ═══ THE ANSWER: THE MARK BRINGS ITS OWN SURFACE ═══
 *
 * A tenant logo is drawn on a fixed near-white plate — the SAME plate in light
 * mode, in dark mode, and over the photograph. It is not themed, because theming
 * it would recreate the very problem: a plate that follows the canvas gives the
 * uploaded file two grounds again, and only one of them can be the right one.
 *
 * That reduces the whole question to a single contract the console can actually
 * state to a gym, and does state, in the upload hint on the Member portal screen:
 * *your logo is shown on a white plate*. A brand's primary asset is drawn for a
 * light ground — that is what a logo kit's default file IS — so the overwhelmingly
 * common upload is correct by construction, and the uncommon one (a white-inked
 * variant) fails visibly and immediately in the console's own preview, next to the
 * sentence explaining why, rather than silently on a member's phone at 6am.
 *
 * The two alternatives were weighed and rejected. A `drop-shadow` halo only where
 * the mark meets the photo leaves the light/dark headers unsolved and turns a
 * flat mark into an embossed one. Keeping the theme swap and feeding it one file
 * twice is the coin toss above. Neither gives a gym a background it can design
 * against.
 *
 * The plate carries a hairline inset edge so it still reads as a deliberate chip
 * on the light canvas, where plate and page are nearly the same white — without
 * it, a light-mode header looked like a logo floating with a stray rectangle of
 * padding around it.
 *
 * ═══ THE FALLBACK KEEPS THE SWAP ═══
 *
 * When there is no tenant mark, the bundled pair renders exactly as it did before
 * this component existed: the `.member-logo` theme swap on the two themed
 * surfaces, and the white-inked file alone over the photograph, where the scrim is
 * dark in both themes. It has two files, so it does not need a plate — and giving
 * it one would put a white chip on a screen the product's own art direction never
 * asked for.
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
   * The tenant plate — a fixed light ground the uploaded file can be designed
   * against, identical on every surface. Not a token: `--color-background-*`
   * follows the theme, and following the theme is the one thing this must not do.
   */
  plate: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 'var(--radius-inner)',
    backgroundColor: '#FFFFFF',
    // The hairline that keeps the plate legible as a chip on the light canvas,
    // where it is otherwise white on near-white. `inset` rather than a border so
    // the plate's box does not grow and shift the header's baseline.
    boxShadow: 'inset 0 0 0 1px rgba(19, 19, 18, 0.10)',
    paddingInline: '0.625rem',
    paddingBlock: '0.375rem',
  },
  /**
   * The uploaded file inside the plate.
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
    maxHeight: '1.75rem',
    maxWidth: '8.5rem',
    objectFit: 'contain',
  },
});

export interface PortalLogoProps {
  /**
   * The tenant's mark, already resolved by the API through
   * `memberPortal.logoUrl ?? brand.logoUrl`, or `null` for "this gym has uploaded
   * no mark" — which is the bundled wordmark's case.
   */
  logoUrl: string | null;
  /**
   * True where the mark sits on the sign-in panel's photograph rather than on a
   * themed surface. It changes only the BUNDLED rendering — a tenant mark carries
   * its own ground and looks the same everywhere, which is the whole point.
   */
  onPhoto?: boolean;
}

/**
 * Render the portal's mark. Decorative by contract: every call site wraps this in
 * a link that already carries the accessible name, so a second announcement here
 * would read the brand twice.
 */
export function PortalLogo({ logoUrl, onPhoto = false }: PortalLogoProps) {
  if (logoUrl) {
    return (
      <span {...stylex.props(styles.plate)}>
        <img src={logoUrl} alt="" {...stylex.props(styles.tenantMark)} />
      </span>
    );
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
