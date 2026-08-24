import type { Metadata } from 'next';
import * as stylex from '@stylexjs/stylex';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AuthPhotoShell } from '../../_components/auth/auth-photo-shell';
import { ButtonLink } from '@/src/components/ui/button-link';
import { verifyEmailToken } from '@/lib/verify-email';

export const metadata: Metadata = {
  title: 'Verify email - FormaCore',
  description: 'Confirm your email address for your FormaCore account.',
};

/** Redeems a single-use token against the API on every hit — never cache it. */
export const dynamic = 'force-dynamic';

/**
 * Where the verification email's button lands. Structurally it IS the sign-in
 * page - same photograph, same brand mark, same join strip - because the
 * person arriving is one click away from signing in for the first time and
 * this is the worst moment to look like a different site. The page has no form
 * and only two states: the token redeemed (sign in and get started) or it
 * didn't (expired, already used, malformed - all the same story to the
 * member), each a title, a line, and the one lime door to sign-in.
 */
const styles = stylex.create({
  cta: {
    marginTop: '0.5rem',
  },
});

export default async function VerifyEmailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const [{ locale }, { token }] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);

  const t = await getTranslations('auth');
  const outcome = token ? await verifyEmailToken(token) : 'invalid';
  const verified = outcome === 'verified';

  return (
    <AuthPhotoShell
      title={verified ? t('verify.successTitle') : t('verify.invalidTitle')}
      subtitle={verified ? t('verify.successSubtitle') : t('verify.invalidSubtitle')}
    >
      <ButtonLink
        href="/member/login"
        variant="primary"
        size="door"
        fullWidth
        label={t('verify.cta')}
        xstyle={styles.cta}
      />
    </AuthPhotoShell>
  );
}
