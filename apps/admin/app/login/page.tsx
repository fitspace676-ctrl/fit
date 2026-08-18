import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import * as stylex from '@stylexjs/stylex';
import { getTranslations } from 'next-intl/server';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { StaffLoginForm } from './staff-login-form';
import { LoginThemeToggle } from './theme-toggle';

export const metadata: Metadata = {
  title: 'Staff sign in - FormaCore',
  description: 'Sign in to the FormaCore staff console.',
};

/**
 * The console's sign-in (`/admin/login`), on the same two-column frame as the
 * member door: a full-bleed gym photograph on the left carrying the brand mark
 * and the light/dark switch, the form on the right with the language switch
 * above it. The two doors are meant to read as one product - only the words
 * change. The member door's join strip has no counterpart here: the console
 * offers nothing to sign UP for, so the photo stands alone.
 *
 * Staff accounts are provisioned by invitation from the console itself, so
 * there is no "create an account" here; that fact is the form's footer line.
 * Password recovery is the member site's reset flow, which sets the same
 * session - the field-level "forgot?" link points there.
 *
 * Rendered outside the `(dashboard)` route group so it gets none of the console
 * chrome - a signed-out operator has no gym context to render a sidebar from.
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

export default async function AdminLoginPage() {
  const t = await getTranslations('admin.login');

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
            <LoginThemeToggle />
          </div>
        </aside>

        {/* ---------------------------- the form side --------------------------- */}
        <section {...stylex.props(styles.form)}>
          <div {...stylex.props(styles.formTop)}>
            <LocaleSwitcher />
          </div>

          <div {...stylex.props(styles.formBody)}>
            <h2 {...stylex.props(styles.title)}>{t('title')}</h2>

            {/* `useSearchParams` (the `?from` return path) needs a Suspense boundary. */}
            <Suspense fallback={null}>
              <StaffLoginForm />
            </Suspense>

            <p {...stylex.props(styles.footer)}>{t('invitation')}</p>
          </div>
        </section>
      </div>
    </main>
  );
}
