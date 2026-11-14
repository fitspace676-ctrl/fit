import type { Metadata } from 'next';
import * as stylex from '@stylexjs/stylex';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getActiveGymMemberTerms, getActiveGymName } from '@/lib/active-gym';
import { Banner } from '@/src/components/ui/kit';

/** Per request: the terms are the tenant's own, resolved from the `Host`. */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('member.terms');
  return { title: t('title') };
}

const styles = stylex.create({
  page: {
    marginInline: 'auto',
    maxWidth: '760px',
    paddingInline: { default: '1.5rem', '@media (min-width: 1024px)': '2.5rem' },
    paddingBlock: { default: '2.5rem', '@media (min-width: 1024px)': '4rem' },
  },
  eyebrow: {
    margin: 0,
    fontSize: '0.75rem',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--color-text-secondary)',
  },
  title: {
    margin: 0,
    marginTop: '0.5rem',
    fontSize: { default: '2rem', '@media (min-width: 1024px)': '2.75rem' },
    lineHeight: 1.15,
    fontWeight: 800,
    color: 'var(--color-text-primary)',
  },
  body: {
    marginTop: '2rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  paragraph: {
    margin: 0,
    fontSize: '0.9375rem',
    lineHeight: 1.75,
    // Keeps the gym's single line breaks (numbered points, lists) as typed.
    whiteSpace: 'pre-line',
    overflowWrap: 'anywhere',
    color: 'var(--color-text-primary)',
  },
  empty: { marginTop: '2rem' },
});

/**
 * The gym's own terms and conditions for members (`/member/terms`): what the
 * join wizard's "I agree" box refers to, written by the gym in the console
 * (Member portal → Terms). Public, so a visitor can read it before joining.
 *
 * Shown in the visitor's language, falling back to the other one when the gym
 * wrote only one. Plain text: blank lines separate paragraphs.
 */
export default async function MemberTermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, terms, gymName] = await Promise.all([
    getTranslations('member.terms'),
    getActiveGymMemberTerms(),
    getActiveGymName(),
  ]);

  const text = (locale === 'en' ? (terms?.en ?? terms?.ka) : (terms?.ka ?? terms?.en)) ?? null;
  const paragraphs = text
    ? text
        .split(/\n\s*\n/)
        .map((block) => block.trim())
        .filter(Boolean)
    : [];

  return (
    <article {...stylex.props(styles.page)}>
      {gymName ? <p {...stylex.props(styles.eyebrow)}>{gymName}</p> : null}
      <h1 {...stylex.props(styles.title)}>{t('title')}</h1>
      {paragraphs.length > 0 ? (
        <div {...stylex.props(styles.body)}>
          {paragraphs.map((paragraph, index) => (
            <p key={index} {...stylex.props(styles.paragraph)}>
              {paragraph}
            </p>
          ))}
        </div>
      ) : (
        <div {...stylex.props(styles.empty)}>
          <Banner tone="info">{t('empty')}</Banner>
        </div>
      )}
    </article>
  );
}
