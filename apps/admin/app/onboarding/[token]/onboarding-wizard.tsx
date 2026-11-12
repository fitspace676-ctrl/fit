'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { FormProvider, useForm } from 'react-hook-form';
import * as stylex from '@stylexjs/stylex';
import { Banner, Button, Field, Form, Switch } from '@fit/ui-kit';
import {
  GYM_ONBOARDING_STEP_SCHEMAS,
  GYM_ONBOARDING_STEPS,
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
import { OnboardingShell, StateIcon } from './onboarding-shell';
import css from './onboarding.module.css';
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
/**
 * The approved gym's own console sign-in. The wizard is served on the platform's
 * host (`app.<root>`), so the gym's host is this one with its first label swapped
 * for the gym's subdomain; everything before `/onboarding/` is the console's base
 * path. A host with no dot (bare `localhost`) has no label to swap and is kept.
 */
export function gymLoginUrl(
  { protocol, host, pathname }: Pick<Location, 'protocol' | 'host' | 'pathname'>,
  subdomainSlug: string,
  email: string,
): string {
  const [, ...parent] = host.split('.');
  const gymHost = parent.length > 0 ? `${subdomainSlug}.${parent.join('.')}` : host;
  const base = pathname.split('/onboarding/')[0] ?? '';
  return `${protocol}//${gymHost}${base}/login?email=${encodeURIComponent(email)}`;
}
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
  fieldset: {
    borderWidth: 0,
    padding: 0,
    margin: 0,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  muted: { color: 'var(--color-text-secondary)', fontSize: '0.8125rem', margin: 0 },
  heading: {
    fontSize: '1.1875rem',
    fontWeight: 700,
    margin: 0,
    color: 'var(--color-text-primary)',
  },
  actions: { display: 'flex', flexWrap: 'wrap', gap: '0.5rem' },
  row: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.5rem',
  },
  time: {
    minWidth: 0,
    width: '6.5rem',
    padding: '0.5rem',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-background-surface)',
    color: 'var(--color-text-primary)',
  },
});

export function OnboardingWizard({ token }: { token: string }) {
  const t = useTranslations('admin.onboarding');
  const tAuth = useTranslations('auth');
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
      // Empty colour keeps the saved brand colour in this wizard.
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

  const screens: Exclude<Screen, 'code'>[] = [...(state?.steps ?? GYM_ONBOARDING_STEPS), 'review'];
  const index = step === 'code' ? screens.length : screens.indexOf(step);
  const previous = screens.slice(0, index).at(-1);
  const done = (item: Exclude<Screen, 'code'>) =>
    item !== 'review' &&
    Boolean(
      state &&
      (state.completedSteps.includes(item) || (item === 'account' && state.owner.hasPassword)),
    );
  const terminal = Boolean(
    dead || !state || ['EXPIRED', 'SUBMITTED', 'REJECTED', 'APPROVED'].includes(state.status),
  );

  function content() {
    const deadKind = dead || (state?.status === 'EXPIRED' ? 'expired' : null);
    if (deadKind)
      return (
        <div className={css.state}>
          <StateIcon kind={deadKind === 'expired' ? 'clock' : 'link'} />
          <h2>{t(`${deadKind}Title`)}</h2>
          <p role="alert">{t(deadKind)}</p>
          <div className={css.stateNote}>
            <strong>{t(`${deadKind}NoteTitle`)}</strong>
            <p>{t(`${deadKind}Note`)}</p>
          </div>
        </div>
      );
    if (!state)
      return error ? (
        <Banner tone="error">{error}</Banner>
      ) : (
        <div className={css.state} role="status">
          <div className={css.loading}>
            <span className={css.spinner} aria-hidden="true" />
            {t('loading')}
          </div>
          <div className={css.skeleton} aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div key={i}>
                <span />
                <div />
              </div>
            ))}
          </div>
        </div>
      );
    if (state.status === 'SUBMITTED' || state.status === 'APPROVED' || state.status === 'REJECTED')
      return (
        <div className={css.state}>
          <StateIcon
            kind={
              state.status === 'REJECTED' ? 'link' : state.status === 'SUBMITTED' ? 'mail' : 'check'
            }
          />
          <h2>
            {t(
              state.status === 'APPROVED'
                ? 'approved'
                : state.status === 'SUBMITTED'
                  ? 'requestSent'
                  : 'rejectedTitle',
            )}
          </h2>
          <p role="status">
            {state.status === 'SUBMITTED'
              ? t('requestSentHint', { email: state.owner.email })
              : t(state.status === 'APPROVED' ? 'approvedHint' : 'rejected')}
          </p>
          {state.status !== 'REJECTED' && (
            <div className={css.gymCard}>
              <span className={css.gymInitial}>{state.gym.name.slice(0, 2).toUpperCase()}</span>
              <div>
                <strong>{state.gym.name}</strong>
                <span>
                  {state.gym.subdomainSlug}.{process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost'}
                </span>
              </div>
            </div>
          )}
          {state.status === 'APPROVED' && (
            <Button
              fullWidth
              label={t('signIn')}
              onClick={() =>
                window.location.assign(
                  gymLoginUrl(window.location, state.gym.subdomainSlug, state.owner.email),
                )
              }
            />
          )}
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
                resendSeconds > 0
                  ? t('resendCountdown', { seconds: resendSeconds })
                  : t('resendCode')
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
          <div className={css.stepHeading}>
            <h2 {...stylex.props(styles.heading)}>{t(`steps.${step}`)}</h2>
            <p aria-live="polite">{t('progress', { current: index + 1, total: screens.length })}</p>
          </div>
          {error && <Banner tone="error">{error}</Banner>}
          <fieldset disabled={pending} {...stylex.props(styles.fieldset)}>
            {step === 'account' && (
              <>
                <div className={css.lockedField}>
                  <Field
                    label={t('ownerEmail')}
                    value={state.owner.email}
                    readOnly
                    hint={t('ownerEmailHint')}
                  />
                  <span className={css.lock} aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                      <rect x="5" y="10" width="14" height="11" rx="2" />
                      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                    </svg>
                  </span>
                </div>
                {state.owner.hasPassword && (
                  <p {...stylex.props(styles.muted)}>{t('savedPasswordHint')}</p>
                )}
                {text('account.ownerName', 'ownerName')}
                <div className={css.password}>
                  {text('account.password', 'password', 'password')}
                  <div className={css.strength}>
                    <div aria-hidden="true">
                      {[0, 1, 2, 3].map((i) => (
                        <span
                          key={i}
                          data-filled={
                            i < Math.min(4, Math.floor((values.account?.password?.length ?? 0) / 3))
                          }
                        />
                      ))}
                    </div>
                    <span>{t('passwordMinimum', { min: PASSWORD_MIN_LENGTH })}</span>
                  </div>
                </div>
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
                <div className={css.contactGrid}>
                  {text('business.phone', 'phone')}
                  {text('business.email', 'email', 'email')}
                </div>
                {text('business.website', 'website')}
              </>
            )}
            {step === 'brand' && (
              <>
                <div>
                  <strong className={css.fieldLabel}>{t('color.label')}</strong>
                  <p {...stylex.props(styles.muted)}>{t('color.description')}</p>
                </div>
                <div className={css.presets} role="group" aria-label={t('color.label')}>
                  {[
                    '#2F7896',
                    '#1A7FD6',
                    '#16213E',
                    '#0F8A6A',
                    '#D9480F',
                    '#C2255C',
                    '#7048E8',
                    '#131312',
                  ].map((color) => (
                    <button
                      key={color}
                      type="button"
                      aria-label={color}
                      aria-pressed={values.brand?.primaryColor?.toUpperCase() === color}
                      style={{ backgroundColor: color }}
                      onClick={() => form.setValue('brand.primaryColor', color)}
                    />
                  ))}
                </div>
                <TextField
                  name="brand.primaryColor"
                  label={t('color.hexLabel', { label: t('color.label') })}
                  disabled={pending}
                />
                <div className={css.preview} role="img" aria-label={t('color.preview')}>
                  <strong>{t('color.previewTitle')}</strong>
                  <div className={css.previewCard}>
                    <span
                      className={css.gymInitial}
                      style={{
                        backgroundColor:
                          values.brand?.primaryColor || state.values.brand.primaryColor,
                      }}
                    >
                      {state.values.business.gymName.slice(0, 2).toUpperCase()}
                    </span>
                    <div>
                      <strong>{state.values.business.gymName}</strong>
                      <span>Vinyasa · 18:30</span>
                    </div>
                    <span
                      className={css.booking}
                      style={{
                        backgroundColor:
                          values.brand?.primaryColor || state.values.brand.primaryColor,
                      }}
                    >
                      {t('color.booking')}
                    </span>
                  </div>
                </div>
              </>
            )}
            {step === 'location' && (
              <>
                {text('location.name', 'locationName')}
                {text('location.address', 'address')}
                {text('location.phone', 'phone')}
                <p className={css.groupLabel}>{t('hours')}</p>
                <div className={css.hours}>
                  {WEEKDAYS.map((day) => {
                    const value = values.location.hours[day];
                    const label = t(`days.${day}`);
                    // The Locations editor's weekday row, kept here because that editor is private to its page.
                    return (
                      <div key={day} className={css.hourRow}>
                        <div className={css.day}>
                          <span>{label}</span>
                          <Switch
                            hideLabel
                            checked={!value.closed}
                            label={t('openDay', { day: label })}
                            disabled={pending}
                            onChange={(open) =>
                              form.setValue(`location.hours.${day}.closed`, !open)
                            }
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
                </div>
              </>
            )}
            {step === 'payments' &&
              paymentKeys.map((key, i) => (
                <div key={key} className={css.payment} data-selected={values.payments[key]}>
                  <span className={css.paymentIcon} aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                      <path
                        d={
                          [
                            'M3 5h18v14H3z M3 9h18 M7 15h3',
                            'M3 5h18v14H3z M3 10h18 M15 15h3',
                            'M3 9l9-6 9 6H3z M5 10v8 M12 10v8 M19 10v8 M3 21h18',
                            'M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z',
                          ][i]
                        }
                      />
                    </svg>
                  </span>
                  <span>{t(`payments.${key}`)}</span>
                  <Switch
                    hideLabel
                    label={t(`payments.${key}`)}
                    checked={values.payments[key]}
                    disabled={pending}
                    onChange={(value) => form.setValue(`payments.${key}`, value)}
                  />
                </div>
              ))}
            {step === 'review' && (
              <>
                <p {...stylex.props(styles.muted)}>{t('reviewHint')}</p>
                <div className={css.reviewList}>
                  {state.steps.map((item) => {
                    const lines: [string, string][] =
                      item === 'account'
                        ? [['', `${state.owner.name ?? ''} · ${state.owner.email}`]]
                        : item === 'payments'
                          ? paymentKeys.map((key) => [
                              t(`payments.${key}`),
                              t(state.values.payments[key] ? 'yes' : 'no'),
                            ])
                          : item === 'location'
                            ? [
                                [
                                  '',
                                  [
                                    state.values.location.name,
                                    state.values.location.address,
                                    state.values.location.phone,
                                  ]
                                    .filter(Boolean)
                                    .join(' · '),
                                ],
                                ...WEEKDAYS.map((day): [string, string] => [
                                  t(`days.${day}`),
                                  state.values.location.hours[day].closed
                                    ? t('closed')
                                    : `${state.values.location.hours[day].open}–${state.values.location.hours[day].close}`,
                                ]),
                              ]
                            : Object.entries(state.values[item]).map(
                                ([key, value]): [string, string] => [
                                  t(`summary.${key}`),
                                  String(value || '—'),
                                ],
                              );
                    return (
                      <section key={item} className={css.reviewCard}>
                        <div className={css.reviewHead}>
                          <strong className={css.reviewTitle}>
                            <span
                              className={css.reviewCheck}
                              data-done={done(item)}
                              aria-hidden="true"
                            >
                              {done(item) ? '✓' : ''}
                            </span>
                            {t(`steps.${item}`)}
                          </strong>
                          <span className={css.reviewEdit}>
                            <Button
                              type="button"
                              variant="ghost"
                              label={t('edit')}
                              disabled={pending}
                              onClick={() => navigate(item)}
                            />
                          </span>
                        </div>
                        {!done(item) && <span className={css.reviewNote}>{t('defaults')}</span>}
                        <dl className={css.reviewLines}>
                          {lines.map(([key, value]) => (
                            <div key={key + value}>
                              {key ? <dt>{key}:</dt> : null}
                              <dd>
                                {/^#[0-9a-f]{6}$/i.test(value) ? (
                                  <span
                                    className={css.reviewDot}
                                    style={{ backgroundColor: value }}
                                    aria-hidden="true"
                                  />
                                ) : null}
                                {value}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </section>
                    );
                  })}
                </div>
              </>
            )}
          </fieldset>
          <div className={css.actions}>
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
              fullWidth
              label={step === 'review' ? t('sendCode') : t('continue')}
              disabled={pending}
              loading={pending}
            />
          </div>
        </Form>
      </FormProvider>
    );
  }

  return (
    <OnboardingShell
      steps={
        terminal
          ? []
          : screens.map((item, position) => ({
              id: item,
              title: t(`steps.${item}`),
              subtitle: t(`stepHints.${item}`),
              current: item === step,
              done: step === 'code' || done(item),
              disabled: pending || step === 'code' || position > index,
              onClick: () => navigate(item),
            }))
      }
    >
      {content()}
    </OnboardingShell>
  );
}
