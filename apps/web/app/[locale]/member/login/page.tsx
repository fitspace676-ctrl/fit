import { Suspense } from 'react';
import type { Metadata } from 'next';
import * as stylex from '@stylexjs/stylex';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/src/i18n/navigation';
import { AuthSplitPanel, AuthSplitShell } from '../../_components/auth/auth-split-shell';
import { Icon } from '@/src/components/ui';
import { AppleSignInButton } from './apple-sign-in-button';
import { CredentialsLoginForm } from './credentials-login-form';
import { GoogleSignInButton } from './google-sign-in-button';

export const metadata: Metadata = {
  title: 'Sign in — Fit',
  description: 'Sign in to your account, or join the gym.',
};

/**
 * The tenant subdomain's front door, split in two: members sign in on the left,
 * newcomers join on the right.
 *
 * The join side is a doorway, not the flow itself — it sells the outcome and
 * hands off to the purchase wizard at `/member/checkout`, which owns the real work
 * (branch → product → details → payment) and is reachable signed-out. Embedding
 * those four steps beside a password field would make the page unusable on a
 * phone and duplicate a flow that already exists.
 *
 * Staff sign in here too, but land elsewhere: `middleware.ts` sends a non-MEMBER
 * session to `/admin` after login. The console's own sign-in lives at
 * `/admin/login` for anyone arriving there directly.
 *
 * Astryx migration (T11.7): page chrome — the forgot-password row, the "or
 * continue with" divider, the social-button stack, the join panel's benefit list
 * and its CTA — is authored in compiled StyleX on the Fit theme tokens. The
 * locale-aware next-intl `Link` keeps the routing contract; only styling moved
 * off Tailwind.
 */
const styles = stylex.create({
  forgotRow: {
    marginTop: '0.75rem',
    textAlign: 'right',
  },
  link: {
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--color-text-accent)',
    textDecoration: {
      default: 'none',
      ':hover': 'underline',
    },
  },
  divider: {
    marginBlock: '1.5rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    fontSize: '0.6875rem',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'var(--color-text-secondary)',
  },
  rule: {
    height: '1px',
    flex: 1,
    backgroundColor: 'var(--color-border)',
  },
  social: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.75rem',
  },
  benefits: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.875rem',
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  benefit: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.625rem',
    fontSize: '0.875rem',
    lineHeight: 1.5,
    color: 'var(--color-text-primary)',
  },
  benefitIcon: {
    marginTop: '0.1875rem',
    flexShrink: 0,
    width: '1rem',
    height: '1rem',
    color: 'var(--color-text-accent)',
  },
  /** Pushes the CTA to the foot of the panel so both cards end level. */
  ctaRow: {
    marginTop: 'auto',
    paddingTop: '1.75rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.625rem',
  },
  cta: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    borderRadius: 'var(--radius-element)',
    paddingInline: '1.25rem',
    paddingBlock: '0.75rem',
    fontSize: '0.9375rem',
    fontWeight: 600,
    textDecoration: 'none',
    color: 'var(--color-text-on-accent)',
    backgroundColor: {
      default: 'var(--color-accent)',
      ':hover': 'color-mix(in srgb, var(--color-accent) 88%, black)',
    },
  },
  ctaNote: {
    margin: 0,
    textAlign: 'center',
    fontSize: '0.8125rem',
    color: 'var(--color-text-secondary)',
  },
});

/** The three selling points the join panel lists, in order. */
const BENEFIT_KEYS = ['branch', 'plan', 'instant'] as const;

export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('auth');

  return (
    <AuthSplitShell heading={t('splitHeading')}>
      <AuthSplitPanel title={t('login.title')} subtitle={t('login.subtitle')}>
        <Suspense fallback={null}>
          <CredentialsLoginForm />
        </Suspense>

        <div {...stylex.props(styles.forgotRow)}>
          <Link href="/member/forgot-password" {...stylex.props(styles.link)}>
            {t('login.forgotPassword')}
          </Link>
        </div>

        <div {...stylex.props(styles.divider)}>
          <span {...stylex.props(styles.rule)} />
          {t('orContinueWith')}
          <span {...stylex.props(styles.rule)} />
        </div>

        <div {...stylex.props(styles.social)}>
          <GoogleSignInButton />
          <AppleSignInButton />
        </div>
      </AuthSplitPanel>

      <AuthSplitPanel promoted title={t('join.title')} subtitle={t('join.subtitle')}>
        <ul {...stylex.props(styles.benefits)}>
          {BENEFIT_KEYS.map((key) => (
            <li key={key} {...stylex.props(styles.benefit)}>
              <Icon name="check" {...stylex.props(styles.benefitIcon)} sw={2.4} />
              {t(`join.benefits.${key}`)}
            </li>
          ))}
        </ul>

        <div {...stylex.props(styles.ctaRow)}>
          <Link href="/member/checkout" {...stylex.props(styles.cta)}>
            {t('join.cta')}
          </Link>
          <p {...stylex.props(styles.ctaNote)}>{t('join.ctaNote')}</p>
        </div>
      </AuthSplitPanel>
    </AuthSplitShell>
  );
}
