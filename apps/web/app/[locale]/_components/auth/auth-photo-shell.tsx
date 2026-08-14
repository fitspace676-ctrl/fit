import type { ReactNode } from 'react';
import Image from 'next/image';
import * as stylex from '@stylexjs/stylex';
import { getTranslations } from 'next-intl/server';
import { getActiveGymName } from '@/lib/active-gym';
import { Link } from '@/src/i18n/navigation';
import { Icon } from '@/src/components/ui';
import { LocaleSwitcher } from '@/src/components/LocaleSwitcher';
import { ThemeToggle } from '@/src/components/member/theme-toggle';

/**
 * The signed-out door: one two-column frame shared by every member auth screen —
 * sign in, forgot password, set a new password.
 *
 * TWO SIDES, DIFFERENT JOBS. The left is a full-bleed photograph of the gym
 * carrying the brand mark, the light/dark switch, and the "not a member yet"
 * doorway. The right is whatever the visitor came to do, with the language
 * switch above it. Only the right column changes between screens, which is the
 * whole reason this is a component rather than a pattern copied per page: the
 * panel, the scrim, the two switches and the join strip cannot drift apart if
 * there is only one of them.
 *
 * The two switches are split on purpose. Language changes what the FORM says, so
 * it sits with the form where a visitor who cannot read the labels will look for
 * it. Light/dark changes the whole page, so it belongs on the chrome side — and
 * the photo panel is the one surface that does not itself change between the two
 * modes, which makes it a stable place to put the control that swaps them.
 *
 * The photo replaces the artboard's copy block and live "next class" panel. That
 * is a deliberate departure from the Lime Block direction, which bans
 * photographic backgrounds — it is a product call, so the code follows it. What
 * the direction still buys us is the discipline around it: one scrim tuned for
 * legibility rather than mood, and no second image, gradient or glow anywhere
 * near it.
 *
 * The join strip is a doorway, not the flow: it hands off to the purchase wizard
 * at `/member/checkout`, which owns the real work (branch → product → details →
 * payment) and is reachable signed-out. It stays on the password screens too —
 * someone who cannot get in may simply not have an account yet.
 */

/**
 * The gym photograph behind the left panel. A static asset rather than tenant
 * data: the gym record carries a logo and brand colours but no cover image, so
 * every tenant shows this one until there is a field to read. Replace the file
 * to change the picture — the path is stable on purpose.
 */
const GYM_PHOTO = '/gym-hero.webp';

/** The three selling points the join strip lists, in order. */
const BENEFIT_KEYS = ['branch', 'plan', 'instant'] as const;

const styles = stylex.create({
  page: {
    minHeight: '100vh',
    // No fill: <body> carries the page texture (see globals.css) and an opaque
    // wrapper here would paint straight over it.
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
     A photograph, a scrim, the brand mark, the theme switch and the join strip. */
  aside: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    gap: '2rem',
    overflow: 'hidden',
    // The panel keeps its own charcoal fill so a missing / still-loading photo
    // degrades to the flat surface it replaced rather than to a white hole.
    backgroundColor: '#131312',
    borderBottomWidth: { default: '1px', '@media (min-width: 1024px)': 0 },
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border)',
    borderInlineEndWidth: { default: 0, '@media (min-width: 1024px)': '1px' },
    borderInlineEndStyle: 'solid',
    borderInlineEndColor: 'var(--color-border)',
    // On a phone the panel is a band above the form, not a full column — a
    // half-height photo would push the password field off the first screen.
    minHeight: { default: '20rem', '@media (min-width: 1024px)': 0 },
    paddingInline: { default: '1.5rem', '@media (min-width: 1024px)': '3rem' },
    paddingBlock: { default: '1.75rem', '@media (min-width: 1024px)': '3rem' },
  },
  photo: {
    objectFit: 'cover',
    objectPosition: 'center',
  },
  // A legibility scrim, not an effect. It is heaviest at the top (the mark and
  // the theme switch) and at the foot (the join strip), and thinnest across the
  // middle where the photo has the panel to itself.
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
    gap: '0.625rem',
    textDecoration: 'none',
  },
  brandMark: {
    display: 'grid',
    placeItems: 'center',
    height: '2.5rem',
    width: '2.5rem',
    borderRadius: 'var(--radius-inner)',
    backgroundColor: 'var(--color-accent)',
    color: 'var(--color-on-accent)',
  },
  brandIcon: { height: '1.25rem', width: '1.25rem' },
  // Over the photo the wordmark is always light — this panel no longer follows
  // the light/dark canvas, because the scrim is dark in both.
  brandWord: {
    fontSize: '1.1875rem',
    fontWeight: 800,
    letterSpacing: '-0.025em',
    color: '#FFFFFF',
  },

  /* ------------------------------- join strip -------------------------------
     On the photo, so it carries its own dark surface rather than the theme's —
     a themed panel would go white here in light mode and punch a hole in the
     picture. The blur is what lets it sit at 64% and stay readable over whatever
     detail is behind it. */
  join: {
    position: 'relative',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    backgroundColor: 'rgba(19, 19, 18, 0.64)',
    backdropFilter: 'blur(14px)',
    padding: { default: '1.25rem', '@media (min-width: 640px)': '1.5rem' },
  },
  // Copy on the left, action on the right, aligned along their BOTTOM edge.
  //
  // Bottom rather than top or centre because the copy is a stack of unknown
  // height — the title wraps at some widths, the benefit lines at others — so
  // the only edge that lines up at every width is the last line against the
  // button's foot. Sitting the button below the whole block instead left it
  // hanging in space with nothing beside it to measure against.
  joinRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    columnGap: '1.5rem',
    rowGap: '1.25rem',
  },
  joinText: {
    flex: 1,
    // The floor before the title starts breaking mid-word ("Downtown
    // Strength-ში?") and every benefit runs to two lines. Under it the CTA
    // wraps to its own row and the copy takes the panel back — better than the
    // two of them squeezing each other. At a 1280 viewport the panel is not
    // wide enough for both, so that is the narrow-desktop layout.
    minWidth: '20rem',
  },
  benefits: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    margin: 0,
    marginTop: '1rem',
    padding: 0,
    listStyle: 'none',
  },
  benefit: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.5rem',
    fontSize: '0.8125rem',
    lineHeight: 1.5,
    color: 'rgba(255, 255, 255, 0.88)',
  },
  // The one lime on this panel. A tick is the only place the direction lets
  // colour into a list — it marks "included", which is the whole point here.
  benefitIcon: {
    marginTop: '0.1875rem',
    flexShrink: 0,
    height: '0.875rem',
    width: '0.875rem',
    color: 'var(--color-accent)',
  },
  joinTitle: {
    margin: 0,
    fontSize: '0.9375rem',
    fontWeight: 700,
    color: '#FFFFFF',
  },
  joinSub: {
    margin: 0,
    marginTop: '0.375rem',
    fontSize: '0.8125rem',
    lineHeight: 1.6,
    color: 'rgba(255, 255, 255, 0.72)',
  },
  // Solid white with ink type. The translucent wash this replaces read as a
  // disabled control: a 14%-white fill on a 55%-dark panel on a photograph has
  // almost no edge, and it was the only thing on the panel a visitor is meant to
  // press. White rather than lime because the lime belongs to this page's
  // PRIMARY action — the form's submit. Joining is the secondary path, so it
  // gets the neutral fill the direction reserves for exactly that.
  joinCta: {
    // Keeps the action on the trailing edge whether it sits beside the copy or
    // wraps onto its own row beneath it.
    marginInlineStart: 'auto',
    display: 'inline-flex',
    height: '2.75rem',
    flexShrink: 0,
    alignItems: 'center',
    gap: '0.375rem',
    borderRadius: 'var(--radius-inner)',
    backgroundColor: {
      default: '#FFFFFF',
      ':hover': '#EEEEED',
    },
    color: '#131312',
    paddingInline: '1.25rem',
    fontSize: '0.875rem',
    fontWeight: 600,
    textDecoration: 'none',
    transitionProperty: 'background-color',
    transitionDuration: '150ms',
  },
  joinCtaIcon: { height: '0.875rem', width: '0.875rem' },

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
    textAlign: 'center',
    fontFamily: 'var(--font-family-heading)',
    fontSize: { default: '2.125rem', '@media (min-width: 640px)': '2.5rem' },
    fontWeight: 800,
    lineHeight: 1,
    letterSpacing: '-0.03em',
    color: 'var(--color-text-primary)',
  },
  // Sign-in needs no explanation and passes no subtitle; the password screens do
  // (which address, what happens next), so the gap under the title belongs to
  // whichever element ends up last.
  titleAlone: {
    marginBottom: '2.25rem',
  },
  subtitle: {
    margin: 0,
    marginTop: '0.875rem',
    marginBottom: '2.25rem',
    textAlign: 'center',
    fontSize: '0.9375rem',
    lineHeight: 1.6,
    color: 'var(--color-text-secondary)',
  },
});

export interface AuthPhotoShellProps {
  /** The one heading on the form side — what the visitor came here to do. */
  title: string;
  /** Optional line under the heading. Omit it when the title says everything. */
  subtitle?: string;
  /** The form, plus anything that belongs with it (social buttons, dividers). */
  children: ReactNode;
  /** Quiet closing line under the form — legal copy, or a way back. */
  footer?: ReactNode;
}

export async function AuthPhotoShell({ title, subtitle, children, footer }: AuthPhotoShellProps) {
  const [t, tShell, gymName] = await Promise.all([
    getTranslations('auth'),
    getTranslations('member.shell'),
    getActiveGymName(),
  ]);

  return (
    <main {...stylex.props(styles.page)}>
      <div {...stylex.props(styles.grid)}>
        {/* ---------------------------- the gym side ---------------------------- */}
        <aside {...stylex.props(styles.aside)}>
          <Image
            src={GYM_PHOTO}
            alt=""
            fill
            // The panel is the full column from `lg` and a band below it, so the
            // browser should fetch roughly half the viewport at desktop widths.
            sizes="(min-width: 1024px) 46vw, 100vw"
            // It is the largest thing above the fold — let it race the form
            // rather than waiting for lazy-load.
            priority
            {...stylex.props(styles.photo)}
          />
          <span aria-hidden {...stylex.props(styles.scrim)} />

          <div {...stylex.props(styles.topRow)}>
            <Link href="/" {...stylex.props(styles.brand)}>
              <span {...stylex.props(styles.brandMark)}>
                <Icon name="bolt" sw={2.4} {...stylex.props(styles.brandIcon)} />
              </span>
              <span {...stylex.props(styles.brandWord)}>{tShell('brand')}</span>
            </Link>
            <ThemeToggle />
          </div>

          <div {...stylex.props(styles.join)}>
            <div {...stylex.props(styles.joinRow)}>
              <div {...stylex.props(styles.joinText)}>
                <p {...stylex.props(styles.joinTitle)}>
                  {gymName ? t('join.titleNamed', { gym: gymName }) : t('join.title')}
                </p>
                <p {...stylex.props(styles.joinSub)}>{t('join.subtitle')}</p>
                <ul {...stylex.props(styles.benefits)}>
                  {BENEFIT_KEYS.map((key) => (
                    <li key={key} {...stylex.props(styles.benefit)}>
                      <Icon name="check" sw={2.6} {...stylex.props(styles.benefitIcon)} />
                      {t(`join.benefits.${key}`)}
                    </li>
                  ))}
                </ul>
              </div>
              <Link href="/member/checkout" {...stylex.props(styles.joinCta)}>
                {t('join.cta')}
                <Icon name="chevronRight" sw={2.2} {...stylex.props(styles.joinCtaIcon)} />
              </Link>
            </div>
          </div>
        </aside>

        {/* ---------------------------- the form side --------------------------- */}
        <section {...stylex.props(styles.form)}>
          <div {...stylex.props(styles.formTop)}>
            <LocaleSwitcher />
          </div>

          <div {...stylex.props(styles.formBody)}>
            <h2 {...stylex.props(styles.title, !subtitle && styles.titleAlone)}>{title}</h2>
            {subtitle ? <p {...stylex.props(styles.subtitle)}>{subtitle}</p> : null}

            {children}

            {footer}
          </div>
        </section>
      </div>
    </main>
  );
}
