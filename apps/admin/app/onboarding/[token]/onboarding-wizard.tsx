'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { FormProvider, useForm } from 'react-hook-form';
import * as stylex from '@stylexjs/stylex';
import { Banner, Button, Field, Form, Switch } from '@fit/ui-kit';
import {
  GYM_ONBOARDING_STEP_SCHEMAS,
  PASSWORD_MIN_LENGTH,
  ONBOARDING_LINK_INVALID_CODE,
  ONBOARDING_LINK_EXPIRED_CODE,
  ONBOARDING_SUBMITTED_CODE,
  ONBOARDING_CODE_INVALID_CODE,
  ONBOARDING_CODE_EXPIRED_CODE,
  ONBOARDING_CODE_COOLDOWN_CODE,
  verifyGymOnboardingCodeSchema,
  ONBOARDING_ACCOUNT_REQUIRED_CODE,
  WEEKDAYS,
  type GymOnboardingState,
  type GymOnboardingStep,
} from '@fit/types';
import { browserTenantHeaders } from '@/lib/tenant-host';
import { AccentColorField } from '@/components/accent-color-field';
import { TextField } from '@/components/ui/form-fields';

/** The API's error envelope, or — on success — the payload itself. */
type ApiBody = { code?: string; message?: string | string[] };

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
type Draft = GymOnboardingState['values'] & { account: { ownerName: string; password: string } };
type Screen = GymOnboardingStep | 'review' | 'code';
const paymentKeys = [
  'acceptCash',
  'acceptCard',
  'acceptBankTransfer',
  'acceptPrepaidCredits',
] as const;
function firstStep(state: GymOnboardingState): Screen {
  if (state.status === 'CODE_SENT') return 'code';
  return (
    state.steps.find(
      (step) =>
        !state.completedSteps.includes(step) && !(step === 'account' && state.owner.hasPassword),
    ) ?? 'review'
  );
}

const styles = stylex.create({
  stack: { display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: 0 },
  fieldset: {
    borderWidth: 0,
    padding: 0,
    margin: 0,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  progress: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.375rem',
    padding: 0,
    margin: 0,
    listStyle: 'none',
  },
  step: {
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-background-muted)',
    color: 'var(--color-text-primary)',
    padding: '0.375rem 0.5rem',
    fontSize: '0.75rem',
    cursor: 'pointer',
    opacity: { default: 1, ':disabled': 0.65 },
  },
  current: { borderColor: 'var(--color-accent)', backgroundColor: 'var(--color-accent-muted)' },
  muted: { color: 'var(--color-text-secondary)', fontSize: '0.8125rem', margin: 0 },
  heading: { fontSize: '1.25rem', margin: 0, color: 'var(--color-text-primary)' },
  actions: { display: 'flex', flexWrap: 'wrap', gap: '0.5rem' },
  card: {
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-container)',
    padding: '0.75rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    minWidth: 0,
    overflowWrap: 'anywhere',
  },
  row: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.5rem',
  },
  time: {
    minWidth: 0,
    width: '8.5rem',
    padding: '0.5rem',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-background-surface)',
    color: 'var(--color-text-primary)',
  },
  swatch: (color: string) => ({
    height: '2.5rem',
    borderRadius: 'var(--radius-element)',
    backgroundColor: color,
    border: '1px solid var(--color-border)',
  }),
});

export function OnboardingWizard({ token }: { token: string }) {
  const t = useTranslations('admin.onboarding');
  const tAuth = useTranslations('auth');
  const router = useRouter();
  const [state, setState] = useState<GymOnboardingState | null>(null);
  const [step, setStep] = useState<Screen>('account');
  const [pending, setPending] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dead, setDead] = useState<string | null>(null);
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const [now, setNow] = useState(Date.now);
  const resendSeconds = Math.max(
    0,
    Math.ceil(
      ((state?.codeResendAvailableAt ? Date.parse(state.codeResendAvailableAt) : 0) - now) / 1000,
    ),
  );

  useEffect(() => {
    if (step !== 'code') return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [step, state?.codeResendAvailableAt]);
  const busy = useRef(false);
  const form = useForm<Draft>();
  const values = form.watch();
  const endpoint = `${API_URL}/gym-onboarding/${encodeURIComponent(token)}`;

  function apply(next: GymOnboardingState) {
    setState(next);
    form.reset({ ...next.values, account: { ownerName: next.owner.name ?? '', password: '' } });
    setConfirm('');
  }

  useEffect(() => {
    const controller = new AbortController();
    setPending(true);
    setDead(null);
    setState(null);
    setError(null);
    void fetch(endpoint, {
      headers: browserTenantHeaders(),
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json()) as ApiBody;
        if (controller.signal.aborted) return;
        if (!response.ok) {
          if (
            body.code === ONBOARDING_LINK_INVALID_CODE ||
            body.code === ONBOARDING_LINK_EXPIRED_CODE
          ) {
            setDead(body.code === ONBOARDING_LINK_EXPIRED_CODE ? 'expired' : 'invalid');
            return;
          }
          throw new Error(typeof body.message === 'string' ? body.message : tAuth('genericError'));
        }
        const next = body as unknown as GymOnboardingState;
        apply(next);
        setStep(firstStep(next));
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted)
          setError(err instanceof Error ? err.message : tAuth('genericError'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setPending(false);
      });
    return () => controller.abort();
    // Form reset is stable; re-fetch only when the link itself changes.
  }, [endpoint]);

  function navigate(target: Screen) {
    if (!state || busy.current) return;
    apply(state); // Unsaved edits never appear as saved in review.
    setStep(target);
    setError(null);
  }
  function following(current: Screen, next = state): Screen {
    if (!next) return 'review';
    return (
      next.steps
        .slice(next.steps.indexOf(current as GymOnboardingStep) + 1)
        .find((item) => !(item === 'account' && next.owner.hasPassword)) ?? 'review'
    );
  }

  async function submit(event?: FormEvent<HTMLFormElement>, resend = false) {
    event?.preventDefault();
    if (!state || busy.current) return;
    setError(null);
    let body: unknown;
    if (step === 'code' && !resend) {
      const parsed = verifyGymOnboardingCodeSchema.safeParse({ code });
      if (!parsed.success) {
        setError(t('codeFormat'));
        return;
      }
      body = parsed.data;
    } else if (step !== 'review' && step !== 'code') {
      const draft = form.getValues();
      if (step === 'account') {
        if (state.owner.hasPassword && !draft.account.password && !confirm) {
          navigate(following(step));
          return;
        }
        if (draft.account.password.length < PASSWORD_MIN_LENGTH) {
          setError(t('tooShort', { min: PASSWORD_MIN_LENGTH }));
          return;
        }
        if (draft.account.password !== confirm) {
          setError(t('mismatch'));
          return;
        }
      }
      const input = { ...draft[step] };
      if (step === 'business' || step === 'location') {
        for (const key of step === 'business'
          ? ['address', 'phone', 'email', 'website']
          : ['phone']) {
          const record = input as Record<string, unknown>;
          const value = record[key];
          if (typeof value === 'string' && !value.trim()) record[key] = null;
        }
      }
      // AccentColorField's reset means the saved brand colour in this wizard.
      if (step === 'brand' && !(input as Draft['brand']).primaryColor)
        (input as Draft['brand']).primaryColor = state.values.brand.primaryColor;
      const parsed = GYM_ONBOARDING_STEP_SCHEMAS[step].safeParse(input);
      if (!parsed.success) {
        setError(
          parsed.error.issues
            .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
            .join(' · '),
        );
        return;
      }
      body = parsed.data;
    }
    busy.current = true;
    setPending(true);
    try {
      const response = await fetch(
        `${endpoint}/${resend || step === 'review' ? 'submit' : step === 'code' ? 'verify' : `steps/${step}`}`,
        {
          method: step === 'review' || step === 'code' ? 'POST' : 'PUT',
          headers: { ...browserTenantHeaders(), 'Content-Type': 'application/json' },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        },
      );
      const result = (await response.json()) as ApiBody;
      if (!response.ok) {
        if (
          result.code === ONBOARDING_LINK_INVALID_CODE ||
          result.code === ONBOARDING_LINK_EXPIRED_CODE
        ) {
          setDead(result.code === ONBOARDING_LINK_EXPIRED_CODE ? 'expired' : 'invalid');
          return;
        }
        if (result.code === ONBOARDING_SUBMITTED_CODE) {
          // Another tab may have submitted or the operator may have decided.
          const refreshed = await fetch(endpoint, {
            headers: browserTenantHeaders(),
            cache: 'no-store',
          });
          if (!refreshed.ok) throw new Error(tAuth('genericError'));
          const next = (await refreshed.json()) as GymOnboardingState;
          apply(next);
          setStep(firstStep(next));
          return;
        }
        if (result.code === ONBOARDING_ACCOUNT_REQUIRED_CODE) {
          apply(state);
          setStep('account');
        }
        if (result.code === ONBOARDING_CODE_INVALID_CODE) throw new Error(t('codeInvalid'));
        if (result.code === ONBOARDING_CODE_EXPIRED_CODE) throw new Error(t('codeExpired'));
        if (result.code === ONBOARDING_CODE_COOLDOWN_CODE) throw new Error(t('codeCooldown'));
        throw new Error(
          Array.isArray(result.message)
            ? result.message.join(' · ')
            : result.message || tAuth('genericError'),
        );
      }
      const next = result as GymOnboardingState;
      apply(next);
      if (step === 'review' || step === 'code') {
        setCode('');
        setStep(firstStep(next));
      } else {
        setStep(following(step, next));
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : tAuth('genericError'));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  if (dead) return <Banner tone="error">{t(dead)}</Banner>;
  if (!state)
    return error ? <Banner tone="error">{error}</Banner> : <p role="status">{t('loading')}</p>;
  if (state.status === 'EXPIRED') return <Banner tone="error">{t('expired')}</Banner>;
  if (state.status === 'SUBMITTED')
    return (
      <div {...stylex.props(styles.stack)}>
        <h3 {...stylex.props(styles.heading)}>{t('requestSent')}</h3>
        <div {...stylex.props(styles.card)}>
          <strong>{state.gym.name}</strong>
          <span>
            {state.gym.subdomainSlug}.{process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost'}
          </span>
        </div>
        <p {...stylex.props(styles.muted)}>{t('requestSentHint', { email: state.owner.email })}</p>
      </div>
    );
  if (state.status === 'REJECTED') return <Banner tone="info">{t('rejected')}</Banner>;
  if (state.status === 'APPROVED')
    return (
      <div {...stylex.props(styles.stack)}>
        <Banner tone="success">{t('approved')}</Banner>
        <Button
          label={t('signIn')}
          onClick={() => router.replace(`/login?email=${encodeURIComponent(state.owner.email)}`)}
        />
      </div>
    );

  if (step === 'code')
    return (
      <Form onSubmit={(event) => void submit(event)} noValidate>
        <h3 {...stylex.props(styles.heading)}>{t('codeTitle')}</h3>
        <p {...stylex.props(styles.muted)}>{t('codeHint', { email: state.owner.email })}</p>
        {error && <Banner tone="error">{error}</Banner>}
        <Field
          label={t('codeLabel')}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(event) => setCode(event.target.value)}
          disabled={pending}
        />
        <Button
          type="submit"
          variant="primary"
          label={t('confirmCode')}
          disabled={pending}
          loading={pending}
        />
        <div {...stylex.props(styles.actions)}>
          <Button
            type="button"
            variant="ghost"
            label={
              resendSeconds > 0 ? t('resendCountdown', { seconds: resendSeconds }) : t('resendCode')
            }
            disabled={pending || resendSeconds > 0}
            onClick={() => void submit(undefined, true)}
          />
          <Button
            type="button"
            variant="ghost"
            label={t('backToDetails')}
            disabled={pending}
            onClick={() => navigate('review')}
          />
        </div>
      </Form>
    );

  const screens: Exclude<Screen, 'code'>[] = [...state.steps, 'review'];
  const index = screens.indexOf(step);
  const previous = screens.slice(0, index).at(-1);
  const done = (item: Exclude<Screen, 'code'>) =>
    item !== 'review' &&
    (state.completedSteps.includes(item) || (item === 'account' && state.owner.hasPassword));
  const text = (name: string, label: string, type: 'text' | 'email' | 'password' = 'text') => (
    <TextField
      name={name}
      label={t(label)}
      type={type}
      disabled={pending}
      autoComplete={type === 'password' ? 'new-password' : undefined}
    />
  );

  return (
    <FormProvider {...form}>
      <Form onSubmit={(event) => void submit(event)} noValidate>
        <p {...stylex.props(styles.muted)} aria-live="polite">
          {t('progress', { current: index + 1, total: screens.length })}
        </p>
        <nav aria-label={t('progressLabel')}>
          <ol {...stylex.props(styles.progress)}>
            {screens.map((item, position) => (
              <li key={item}>
                <button
                  type="button"
                  aria-current={item === step ? 'step' : undefined}
                  disabled={pending || position > index}
                  onClick={() => navigate(item)}
                  {...stylex.props(styles.step, item === step && styles.current)}
                >
                  {t(`steps.${item}`)}
                  {done(item) ? ` · ${t('done')}` : ''}
                </button>
              </li>
            ))}
          </ol>
        </nav>
        <h3 {...stylex.props(styles.heading)}>{t(`steps.${step}`)}</h3>
        {error && <Banner tone="error">{error}</Banner>}
        <fieldset disabled={pending} {...stylex.props(styles.fieldset)}>
          {step === 'account' && (
            <>
              <Field label={t('ownerEmail')} value={state.owner.email} readOnly />
              <p {...stylex.props(styles.muted)}>{t('ownerEmailHint')}</p>
              {state.owner.hasPassword && (
                <p {...stylex.props(styles.muted)}>{t('savedPasswordHint')}</p>
              )}
              {text('account.ownerName', 'ownerName')}
              {text('account.password', 'password', 'password')}
              <Field
                label={t('confirm')}
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                disabled={pending}
              />
            </>
          )}
          {step === 'business' && (
            <>
              {text('business.gymName', 'gymName')}
              {text('business.address', 'address')}
              {text('business.phone', 'phone')}
              {text('business.email', 'email', 'email')}
              {text('business.website', 'website')}
            </>
          )}
          {step === 'brand' && (
            <>
              <AccentColorField
                name="brand.primaryColor"
                label={t('color.label')}
                description={t('color.description')}
                namespace="admin.onboarding.color"
                fallback={state.values.brand.primaryColor}
              />
              <div
                role="img"
                aria-label={t('color.preview')}
                {...stylex.props(
                  styles.swatch(values.brand?.primaryColor || state.values.brand.primaryColor),
                )}
              />
            </>
          )}
          {step === 'location' && (
            <>
              {text('location.name', 'locationName')}
              {text('location.address', 'address')}
              {text('location.phone', 'phone')}
              <p {...stylex.props(styles.muted)}>{t('hours')}</p>
              {WEEKDAYS.map((day) => {
                const value = values.location.hours[day];
                const label = t(`days.${day}`);
                // The Locations editor's weekday row, kept here because that editor is private to its page.
                return (
                  <div key={day} {...stylex.props(styles.card)}>
                    <div {...stylex.props(styles.row)}>
                      <span>{label}</span>
                      <Switch
                        checked={!value.closed}
                        label={t('openDay', { day: label })}
                        disabled={pending}
                        onChange={(open) => form.setValue(`location.hours.${day}.closed`, !open)}
                      />
                    </div>
                    {value.closed ? (
                      <span {...stylex.props(styles.muted)}>{t('closed')}</span>
                    ) : (
                      <div {...stylex.props(styles.row)}>
                        <input
                          type="time"
                          aria-label={t('opens', { day: label })}
                          {...form.register(`location.hours.${day}.open`)}
                          {...stylex.props(styles.time)}
                        />
                        <span aria-hidden>–</span>
                        <input
                          type="time"
                          aria-label={t('closes', { day: label })}
                          {...form.register(`location.hours.${day}.close`)}
                          {...stylex.props(styles.time)}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
          {step === 'payments' &&
            paymentKeys.map((key) => (
              <Switch
                key={key}
                label={t(`payments.${key}`)}
                checked={values.payments[key]}
                disabled={pending}
                onChange={(value) => form.setValue(`payments.${key}`, value)}
              />
            ))}
          {step === 'review' && (
            <>
              <p {...stylex.props(styles.muted)}>{t('reviewHint')}</p>
              {state.steps.map((item) => (
                <section key={item} {...stylex.props(styles.card)}>
                  <div {...stylex.props(styles.row)}>
                    <strong>{t(`steps.${item}`)}</strong>
                    <Button
                      type="button"
                      variant="ghost"
                      label={t('edit')}
                      disabled={pending}
                      onClick={() => navigate(item)}
                    />
                  </div>
                  <span {...stylex.props(styles.muted)}>
                    {done(item) ? t('saved') : t('defaults')}
                  </span>
                  {item === 'account' ? (
                    <span>
                      {state.owner.name} · {state.owner.email}
                    </span>
                  ) : item === 'payments' ? (
                    paymentKeys.map((key) => (
                      <span key={key}>
                        {t(`payments.${key}`)}: {t(state.values.payments[key] ? 'yes' : 'no')}
                      </span>
                    ))
                  ) : item === 'location' ? (
                    <>
                      <span>
                        {state.values.location.name} · {state.values.location.address} ·{' '}
                        {state.values.location.phone}
                      </span>
                      {WEEKDAYS.map((day) => (
                        <span key={day}>
                          {t(`days.${day}`)}:{' '}
                          {state.values.location.hours[day].closed
                            ? t('closed')
                            : `${state.values.location.hours[day].open}–${state.values.location.hours[day].close}`}
                        </span>
                      ))}
                    </>
                  ) : (
                    Object.entries(state.values[item]).map(([key, value]) => (
                      <span key={key}>
                        {t(`summary.${key}`)}: {value || '—'}
                      </span>
                    ))
                  )}
                </section>
              ))}
            </>
          )}
        </fieldset>
        <div {...stylex.props(styles.actions)}>
          {previous && (
            <Button
              type="button"
              variant="ghost"
              label={t('back')}
              disabled={pending}
              onClick={() => navigate(previous)}
            />
          )}
          {step !== 'account' && step !== 'review' && (
            <Button
              type="button"
              variant="ghost"
              label={t('skip')}
              disabled={pending}
              onClick={() => navigate(following(step))}
            />
          )}
          <Button
            type="submit"
            variant="primary"
            label={step === 'review' ? t('sendCode') : t('continue')}
            disabled={pending}
            loading={pending}
          />
        </div>
      </Form>
    </FormProvider>
  );
}
