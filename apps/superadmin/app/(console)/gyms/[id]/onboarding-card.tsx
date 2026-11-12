'use client';

import { type ReactNode, useState, useTransition } from 'react';
import * as stylex from '@stylexjs/stylex';
import { GYM_ONBOARDING_STEPS, type AdminGymOnboarding, type GymOnboardingStep } from '@fit/types';
import { Banner, Button, Card, ConfirmDialog, EmptyState } from '@fit/ui-kit';
import { Cap, Mono } from '@/components/ops';
import { createOnboardingLinkAction } from '../../actions';

const STEP_LABELS: Record<GymOnboardingStep, string> = {
  account: 'Owner account',
  business: 'Business details',
  locale: 'Language & currency',
  brand: 'Brand colour',
  location: 'First location',
  payments: 'Payment methods',
};

const styles = stylex.create({
  stack: { display: 'flex', flexDirection: 'column', gap: '1.25rem', minWidth: 0 },
  row: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' },
  progress: { display: 'flex', flexDirection: 'column', gap: '0.625rem' },
  summary: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: '1rem',
    fontSize: '0.875rem',
    fontWeight: 600,
  },
  segments: { display: 'flex', gap: '0.25rem' },
  segment: {
    height: '0.375rem',
    flex: 1,
    borderRadius: '999px',
    backgroundColor: 'var(--ops-ink-100)',
  },
  doneSegment: { backgroundColor: 'var(--ops-forma-500)' },
  steps: {
    display: 'grid',
    gridTemplateColumns: {
      default: 'minmax(0, 1fr)',
      '@media (min-width: 640px)': 'repeat(2, minmax(0, 1fr))',
    },
    gap: '0.625rem 1.5rem',
    listStyle: 'none',
    padding: 0,
    margin: 0,
  },
  step: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.625rem',
    fontSize: '0.84375rem',
    color: 'var(--ops-ink-400)',
  },
  doneStep: { color: 'var(--ops-ink-950)' },
  circle: {
    display: 'grid',
    placeItems: 'center',
    width: '1.25rem',
    height: '1.25rem',
    flexShrink: 0,
    borderRadius: '999px',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--ops-ink-300)',
    fontSize: '0.75rem',
  },
  doneCircle: {
    borderColor: 'var(--ops-forma-500)',
    backgroundColor: 'var(--ops-forma-500)',
    color: 'var(--ops-white)',
  },
  inset: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    padding: '0.75rem',
    borderRadius: '14px',
    backgroundColor: 'var(--ops-ink-50)',
    minWidth: 0,
  },
  field: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    flex: '1 1 10rem',
    minWidth: 0,
    paddingInline: '0.75rem',
    height: '2.25rem',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    borderRadius: '10px',
    backgroundColor: 'var(--ops-white)',
    color: 'var(--ops-ink-400)',
  },
  linkField: {
    width: '100%',
    minWidth: 0,
    padding: 0,
    border: 0,
    backgroundColor: 'transparent',
    color: 'var(--ops-ink-700)',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    textOverflow: 'ellipsis',
  },
  link: {
    color: 'var(--color-text-accent)',
    textDecoration: 'none',
    fontSize: '0.8125rem',
    whiteSpace: 'nowrap',
  },
  srOnly: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clipPath: 'inset(50%)',
    whiteSpace: 'nowrap',
    border: 0,
  },
  linkIcon: { flexShrink: 0 },
});

export function OnboardingCard({
  gymId,
  slug,
  onboarding,
  url,
  children,
}: {
  gymId: string;
  slug: string;
  onboarding: AdminGymOnboarding | null;
  url: string | null;
  children?: ReactNode;
}) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const link = url ?? onboarding?.token;

  function createLink() {
    setError(null);
    setCopied(false);
    startTransition(async () => {
      try {
        const result = await createOnboardingLinkAction(gymId);
        if (!result.ok) setError(result.error);
      } catch {
        setError('Could not create the onboarding link. Please try again.');
      } finally {
        setConfirming(false);
      }
    });
  }

  async function copyLink() {
    if (!link) return;
    setError(null);
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setError('Could not copy. Select the link or token above and copy it manually.');
    }
  }

  return (
    <Card>
      <div {...stylex.props(styles.stack)}>
        {error ? <Banner tone="error">{error}</Banner> : null}
        {onboarding ? (
          <>
            <div {...stylex.props(styles.progress)}>
              <div {...stylex.props(styles.summary)}>
                <span>
                  {onboarding.completedSteps.length} of {onboarding.totalSteps} steps
                </span>
                <Mono>
                  {onboarding.totalSteps > 0
                    ? Math.round((onboarding.completedSteps.length / onboarding.totalSteps) * 100)
                    : 0}
                  %
                </Mono>
              </div>
              <div {...stylex.props(styles.segments)} aria-hidden="true">
                {GYM_ONBOARDING_STEPS.map((step) => (
                  <span
                    key={step}
                    {...stylex.props(
                      styles.segment,
                      onboarding.completedSteps.includes(step) && styles.doneSegment,
                    )}
                  />
                ))}
              </div>
            </div>
            <ul {...stylex.props(styles.steps)} aria-label="Onboarding steps">
              {GYM_ONBOARDING_STEPS.map((step) => {
                const done = onboarding.completedSteps.includes(step);
                return (
                  <li key={step} {...stylex.props(styles.step, done && styles.doneStep)}>
                    <span
                      aria-hidden="true"
                      {...stylex.props(styles.circle, done && styles.doneCircle)}
                    >
                      {done ? '✓' : null}
                    </span>
                    <span>{STEP_LABELS[step]}</span>
                    <span {...stylex.props(styles.srOnly)}> — {done ? 'Done' : 'Not done'}</span>
                  </li>
                );
              })}
            </ul>
            {onboarding.status !== 'COMPLETED' && link ? (
              <div {...stylex.props(styles.inset)}>
                <Cap>Onboarding link</Cap>
                <div {...stylex.props(styles.row)}>
                  <div {...stylex.props(styles.field)}>
                    <svg
                      aria-hidden="true"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      {...stylex.props(styles.linkIcon)}
                    >
                      <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2" />
                    </svg>
                    <input
                      aria-label={
                        url ? `Onboarding link for ${slug}` : `Onboarding token for ${slug}`
                      }
                      readOnly
                      value={link}
                      onFocus={(event) => event.currentTarget.select()}
                      {...stylex.props(styles.linkField)}
                    />
                  </div>
                  <Button
                    variant="secondary"
                    size="inline"
                    label={copied ? 'Copied' : 'Copy'}
                    disabled={pending}
                    onClick={() => void copyLink()}
                  />
                  {url ? (
                    <a href={url} target="_blank" rel="noreferrer" {...stylex.props(styles.link)}>
                      Open ↗
                    </a>
                  ) : null}
                </div>
                <span role="status" {...stylex.props(styles.srOnly)}>
                  {copied ? 'Copied to clipboard' : ''}
                </span>
                {!url ? (
                  <Banner tone="info">
                    NEXT_PUBLIC_ROOT_DOMAIN is not set. Set it to build the onboarding URL. The raw
                    token is shown above.
                  </Banner>
                ) : null}
              </div>
            ) : null}
            {children}
            {onboarding.status !== 'COMPLETED' ? (
              <div {...stylex.props(styles.row)}>
                <Button
                  variant="secondary"
                  size="card"
                  label="Regenerate link"
                  loading={pending}
                  onClick={() => setConfirming(true)}
                />
              </div>
            ) : null}
          </>
        ) : (
          <>
            <EmptyState
              compact
              title="No onboarding link"
              body="Create a link so the owner can set up their account and gym settings."
            />
            <div {...stylex.props(styles.row)}>
              <Button
                variant="primary"
                size="card"
                label="Create onboarding link"
                loading={pending}
                onClick={createLink}
              />
            </div>
          </>
        )}
        <ConfirmDialog
          open={confirming}
          onClose={() => setConfirming(false)}
          title={`Regenerate onboarding link for ${slug}?`}
          description="The old link will stop working immediately. Completed steps will be kept. Send the new link to the owner."
          cancelLabel="Cancel"
          confirmLabel="Regenerate link"
          confirmVariant="destructive"
          loading={pending}
          onConfirm={createLink}
        />
      </div>
    </Card>
  );
}
