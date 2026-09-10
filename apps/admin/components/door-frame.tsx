import type { ReactNode } from 'react';
import Link from 'next/link';
import * as stylex from '@stylexjs/stylex';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { DoorThemeToggle } from '@/components/door-theme-toggle';

/**
 * The frame every way INTO the console is drawn on: a full-bleed gym photograph
 * on the left carrying the brand mark and the light/dark switch, the task on the
 * right with the language switch above it.
 *
 * Two pages render it - `/login` (the door an operator comes back to) and
 * `/activate` (the one a gym owner walks through exactly once, from their
 * onboarding email). They are meant to read as one product, and as the same
 * product as the member door: only the words change. The member door's join strip
 * has no counterpart here - the console offers nothing to sign UP for, so the
 * photo stands alone.
 *
 * Rendered outside the `(dashboard)` route group so it gets none of the console
 * chrome - nobody standing here has a gym context to draw a sidebar from.
 */

/**
 * This app's basePath behind the tenant proxy. Next prefixes navigation and
 * `_next` assets with it, but not plain `<img>` src attributes, and its image
 * OPTIMIZER rejects public-folder urls under a basePath (400) - which is why
 * the photo and the logo below are plain `<img>` tags on prefixed paths.
 */
const BASE_PATH = process.env.NEXT_PUBLIC_ADMIN_BASE_PATH ?? '/admin';

/**
 * The gym photograph behind the left panel - the same static asset the member
 * door shows (`apps/web/public/gym-hero.webp`); replace both files together to
 * change the picture.
 */
const GYM_PHOTO = `${BASE_PATH}/gym-hero.webp`;

const styles = stylex.create({
  page: {
    minHeight: '100vh',
    color: 'var(--color-text-primary)',
  },
  grid: {
    display: 'grid',
    minHeight: '100vh',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 1024px)': '0.92fr 1.08fr',
    },
  },

  /* ============================== the gym side ==============================
     A photograph, a scrim, the brand mark and the theme switch. */
  aside: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    gap: '2rem',
    overflow: 'hidden',
    // The panel keeps its own charcoal fill so a missing / still-loading photo
    // degrades to a flat surface rather than to a white hole.
    backgroundColor: '#131312',
    borderBottomWidth: { default: '1px', '@media (min-width: 1024px)': 0 },
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border)',
    borderInlineEndWidth: { default: 0, '@media (min-width: 1024px)': '1px' },
    borderInlineEndStyle: 'solid',
    borderInlineEndColor: 'var(--color-border)',
    // On a phone the panel is a band above the form, not a full column - a
    // half-height photo would push the password field off the first screen.
    minHeight: { default: '20rem', '@media (min-width: 1024px)': 0 },
    paddingInline: { default: '1.5rem', '@media (min-width: 1024px)': '3rem' },
    paddingBlock: { default: '1.75rem', '@media (min-width: 1024px)': '3rem' },
  },
  photo: {
    position: 'absolute',
    inset: 0,
    height: '100%',
    width: '100%',
    objectFit: 'cover',
    objectPosition: 'center',
  },
  // A legibility scrim, not an effect - heaviest at the top (the mark and the
  // theme switch) and at the foot (the member strip), thinnest across the middle.
  scrim: {
    position: 'absolute',
    inset: 0,
    backgroundImage:
      'linear-gradient(180deg, rgba(19,19,18,0.74) 0%, rgba(19,19,18,0.26) 40%, rgba(19,19,18,0.34) 64%, rgba(19,19,18,0.68) 100%)',
  },

  topRow: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '1rem',
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    textDecoration: 'none',
  },
  // Over the photo the wordmark is always light - the scrim is dark in both
  // modes, so this is always logodark.png (the white-inked logo), no theme swap.
  brandLogo: {
    width: '9.25rem',
    height: 'auto',
    maxWidth: '100%',
    objectFit: 'contain',
  },

  /* ============================== the form side ============================= */
  form: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'var(--color-background-surface)',
    paddingInline: { default: '2rem', '@media (min-width: 1024px)': '3.5rem' },
    paddingBlock: { default: '2rem', '@media (min-width: 1024px)': '3rem' },
  },
  formTop: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  // Fills the column so the form sits optically centred between the language
  // switch and the foot of the page, rather than pinned to the top.
  formBody: {
    marginInline: 'auto',
    display: 'flex',
    width: '100%',
    maxWidth: '440px',
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'center',
    paddingBlock: '2.5rem',
  },
  title: {
    margin: 0,
    marginBottom: '2.25rem',
    textAlign: 'center',
    fontFamily: 'var(--font-family-heading)',
    fontSize: { default: '2.125rem', '@media (min-width: 640px)': '2.5rem' },
    fontWeight: 800,
    lineHeight: 1,
    letterSpacing: '-0.03em',
    color: 'var(--color-text-primary)',
  },
  // The activation door states what the page is for under its heading; the
  // sign-in door has nothing to explain and passes no subtitle.
  subtitle: {
    margin: 0,
    marginTop: '-1.5rem',
    marginBottom: '2rem',
    textAlign: 'center',
    fontSize: '0.875rem',
    lineHeight: 1.6,
    color: 'var(--color-text-secondary)',
  },
  // The quiet closing line under the form - where the member door's terms live,
  // this door states how staff accounts come to exist.
  footer: {
    margin: 0,
    marginTop: '2rem',
    textAlign: 'center',
    fontSize: '0.75rem',
    lineHeight: 1.7,
    color: 'var(--color-text-secondary)',
  },
});

export interface DoorFrameProps {
  /** The heading over the task, in the reader's language. */
  title: string;
  /** One explanatory line under the heading; omitted on doors that need none. */
  subtitle?: string;
  /** The form itself. */
  children: ReactNode;
  /** The quiet closing line under the form. */
  footer?: string;
}

export function DoorFrame({ title, subtitle, children, footer }: DoorFrameProps) {
  return (
    <main {...stylex.props(styles.page)}>
      <div {...stylex.props(styles.grid)}>
        {/* ---------------------------- the gym side ---------------------------- */}
        <aside {...stylex.props(styles.aside)}>
          <img src={GYM_PHOTO} alt="" {...stylex.props(styles.photo)} />
          <span aria-hidden {...stylex.props(styles.scrim)} />

          <div {...stylex.props(styles.topRow)}>
            <Link href="/" {...stylex.props(styles.brand)}>
              <img
                src={`${BASE_PATH}/logodark.png`}
                alt="FormaCore"
                {...stylex.props(styles.brandLogo)}
              />
            </Link>
            <DoorThemeToggle />
          </div>
        </aside>

        {/* ---------------------------- the form side --------------------------- */}
        <section {...stylex.props(styles.form)}>
          <div {...stylex.props(styles.formTop)}>
            <LocaleSwitcher />
          </div>

          <div {...stylex.props(styles.formBody)}>
            <h2 {...stylex.props(styles.title)}>{title}</h2>
            {subtitle ? <p {...stylex.props(styles.subtitle)}>{subtitle}</p> : null}

            {children}

            {footer ? <p {...stylex.props(styles.footer)}>{footer}</p> : null}
          </div>
        </section>
      </div>
    </main>
  );
}
