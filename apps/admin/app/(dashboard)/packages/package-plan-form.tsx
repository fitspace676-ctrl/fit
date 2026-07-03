'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  MAX_PACKAGE_FEATURES,
  type PackageBillingInterval,
  type PackagePlanStatus,
} from '@fit/types';
import { Badge, Btn, Card, Icon, Switch } from '@/components/ui';
import {
  BILLING_INTERVALS,
  formatPrice,
  inputToMinor,
  intervalSuffix,
  minorToInput,
  sessionLabel,
} from './format';
import {
  createPackagePlanAction,
  setPackagePlanActiveAction,
  updatePackagePlanAction,
} from './actions';

/** Reference-design field styling shared by every input / select / textarea. */
const FIELD_CLASS =
  'h-11 w-full rounded-field bg-ink-50 px-3.5 text-sm text-ink-900 outline-none ring-1 ring-inset ring-ink-200 transition placeholder:text-ink-400 focus:ring-2 focus:ring-brand-500 dark:bg-white/[0.04] dark:text-white dark:ring-white/10 dark:placeholder:text-ink-500';

/** Reference-design label styling (small caps eyebrow). */
const LABEL_CLASS =
  'mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-500 dark:text-ink-400';

/** Soft inset panel used by the perk rows + visibility rows. */
const SOFT_PANEL =
  'rounded-card bg-ink-50 ring-1 ring-inset ring-ink-200 dark:bg-white/[0.03] dark:ring-white/10';

/** The eye glyph for the "Member preview" eyebrow (not in the shared icon set). */
const EYE_PATH =
  'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z';

/** The infinity glyph shown when the package has unlimited sessions. */
const INFINITY_PATH =
  'M6.5 9a3.5 3.5 0 1 0 0 6c2 0 3.5-3 5.5-3s4 3 5.5 3a3.5 3.5 0 1 0 0-6c-2 0-3.5 3-5.5 3S8.5 9 6.5 9Z';

type Initial = {
  name: string;
  description: string;
  priceAmount: number;
  currency: string;
  billingInterval: PackageBillingInterval;
  sessionCount: number | null;
  features: string[];
  popular: boolean;
  status: PackagePlanStatus;
};

type Props =
  | { mode: 'create' }
  | {
      mode: 'edit';
      planId: string;
      initial: Initial;
    };

/**
 * The create / edit package-plan form (T4.11), laid out as the reference
 * "Billing · Plan editor": form cards on the left (Basics & pricing, Access &
 * sessions, Perks, Visibility), a live member-facing preview on the right, and
 * a floating unsaved-changes save bar. One component serves both flows.
 *
 * Beyond the profile fields (name, description, price, currency, cadence) it
 * owns the session allowance (blank = unlimited), the perks editor
 * (add-and-press-Enter rows) and two visibility switches: "Active" (create:
 * the initial `status`; edit: staged and applied via the dedicated lifecycle
 * action after the profile PATCH) and "Mark as popular".
 *
 * On success it navigates to the plan's detail page; the discriminated
 * `ActionResult` surfaces any API error inline without throwing across the
 * Server Action boundary.
 */
export function PackagePlanForm(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isEdit = props.mode === 'edit';
  const initial: Initial = isEdit
    ? props.initial
    : {
        name: '',
        description: '',
        priceAmount: 0,
        currency: 'USD',
        billingInterval: 'MONTH',
        sessionCount: null,
        features: [],
        popular: false,
        status: 'ACTIVE',
      };
  const initialPrice = initial.priceAmount ? minorToInput(initial.priceAmount) : '';
  const initialSessions = initial.sessionCount === null ? '' : String(initial.sessionCount);

  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [price, setPrice] = useState(initialPrice);
  const [currency, setCurrency] = useState(initial.currency);
  const [billingInterval, setBillingInterval] = useState<PackageBillingInterval>(
    initial.billingInterval,
  );
  const [sessionCount, setSessionCount] = useState(initialSessions);
  const [features, setFeatures] = useState<string[]>(initial.features);
  const [featureInput, setFeatureInput] = useState('');
  const [popular, setPopular] = useState(initial.popular);
  const [active, setActive] = useState(initial.status === 'ACTIVE');

  const dirty =
    name !== initial.name ||
    description !== initial.description ||
    price !== initialPrice ||
    currency !== initial.currency ||
    billingInterval !== initial.billingInterval ||
    sessionCount !== initialSessions ||
    popular !== initial.popular ||
    active !== (initial.status === 'ACTIVE') ||
    features.length !== initial.features.length ||
    features.some((feature, i) => feature !== initial.features[i]);

  const atFeatureLimit = features.length >= MAX_PACKAGE_FEATURES;

  function addFeature(): void {
    const trimmed = featureInput.trim();
    if (!trimmed || atFeatureLimit) return;
    setFeatures((prev) => [...prev, trimmed]);
    setFeatureInput('');
  }

  function removeFeature(index: number): void {
    setFeatures((prev) => prev.filter((_, i) => i !== index));
  }

  /** Reset every field back to the loaded plan (or a blank create form). */
  function discard(): void {
    setError(null);
    setName(initial.name);
    setDescription(initial.description);
    setPrice(initialPrice);
    setCurrency(initial.currency);
    setBillingInterval(initial.billingInterval);
    setSessionCount(initialSessions);
    setFeatures(initial.features);
    setFeatureInput('');
    setPopular(initial.popular);
    setActive(initial.status === 'ACTIVE');
  }

  // A blank session count means "unlimited" (null on the wire).
  const trimmedSessions = sessionCount.trim();
  const parsedSessions = trimmedSessions === '' ? null : Number(trimmedSessions);

  function onSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setError(null);

    const profile = {
      name,
      description,
      priceAmount: inputToMinor(price),
      currency,
      billingInterval,
      sessionCount: parsedSessions,
      features,
      popular,
    };
    const nextStatus: PackagePlanStatus = active ? 'ACTIVE' : 'INACTIVE';

    startTransition(async () => {
      if (isEdit) {
        const result = await updatePackagePlanAction(props.planId, profile);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        // `status` isn't part of the profile PATCH — apply a staged change via
        // the dedicated lifecycle action.
        if (nextStatus !== props.initial.status) {
          const lifecycle = await setPackagePlanActiveAction(props.planId, active);
          if (!lifecycle.ok) {
            setError(lifecycle.error);
            return;
          }
        }
        router.push(`/packages/${props.planId}`);
        router.refresh();
      } else {
        const result = await createPackagePlanAction({ ...profile, status: nextStatus });
        if (result.ok) {
          router.push(`/packages/${result.data.id}`);
          router.refresh();
        } else {
          setError(result.error);
        }
      }
    });
  }

  const previewPrice = formatPrice(inputToMinor(price), currency);
  const previewUnit = intervalSuffix(billingInterval);
  const previewSessions = sessionLabel(
    parsedSessions === null || Number.isNaN(parsedSessions) ? null : parsedSessions,
  );

  return (
    <form onSubmit={onSubmit}>
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1fr_360px]">
        {/* Form cards. */}
        <div className="min-w-0 space-y-5">
          {/* Basics & pricing. */}
          <Card glow className="p-5 sm:p-6">
            <h3 className="font-display text-base font-bold tracking-tight text-ink-900 dark:text-white">
              Basics &amp; pricing
            </h3>
            <div className="mt-4 space-y-4">
              <div>
                <label htmlFor="plan-name" className={LABEL_CLASS}>
                  Package title<span className="text-danger-400"> *</span>
                </label>
                <input
                  id="plan-name"
                  name="name"
                  type="text"
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoComplete="off"
                  placeholder="e.g. 10 Session Pack"
                  className={FIELD_CLASS}
                />
              </div>
              <div>
                <label htmlFor="plan-description" className={LABEL_CLASS}>
                  Description
                </label>
                <textarea
                  id="plan-description"
                  name="description"
                  rows={2}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="A short description of the package."
                  className={`${FIELD_CLASS} h-auto resize-none py-2.5`}
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label htmlFor="plan-price" className={LABEL_CLASS}>
                    Price<span className="text-danger-400"> *</span>
                  </label>
                  <input
                    id="plan-price"
                    name="price"
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={price}
                    onChange={(event) => setPrice(event.target.value)}
                    placeholder="0.00"
                    className={`${FIELD_CLASS} font-mono tabular-nums`}
                  />
                </div>
                <div>
                  <label htmlFor="plan-currency" className={LABEL_CLASS}>
                    Currency
                  </label>
                  <input
                    id="plan-currency"
                    name="currency"
                    type="text"
                    maxLength={3}
                    value={currency}
                    onChange={(event) => setCurrency(event.target.value.toUpperCase())}
                    placeholder="USD"
                    autoComplete="off"
                    className={`${FIELD_CLASS} uppercase`}
                  />
                </div>
                <div>
                  <label htmlFor="plan-interval" className={LABEL_CLASS}>
                    Interval
                  </label>
                  <select
                    id="plan-interval"
                    name="billingInterval"
                    value={billingInterval}
                    onChange={(event) =>
                      setBillingInterval(event.target.value as PackageBillingInterval)
                    }
                    className={`${FIELD_CLASS} px-3`}
                  >
                    {BILLING_INTERVALS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </Card>

          {/* Access & sessions. */}
          <Card glow className="p-5 sm:p-6">
            <h3 className="font-display text-base font-bold tracking-tight text-ink-900 dark:text-white">
              Access &amp; sessions
            </h3>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="plan-sessions" className={LABEL_CLASS}>
                  Included sessions
                </label>
                <input
                  id="plan-sessions"
                  name="sessionCount"
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  value={sessionCount}
                  onChange={(event) => setSessionCount(event.target.value)}
                  placeholder="Unlimited"
                  className={`${FIELD_CLASS} font-mono tabular-nums`}
                />
                <p className="mt-1.5 text-[11px] text-ink-400 dark:text-ink-500">
                  Blank = unlimited sessions
                </p>
              </div>
            </div>
          </Card>

          {/* Perks. */}
          <Card glow className="p-5 sm:p-6">
            <h3 className="font-display text-base font-bold tracking-tight text-ink-900 dark:text-white">
              Perks
            </h3>
            <p className="mb-3 mt-0.5 text-sm text-ink-500 dark:text-ink-400">
              Shown as a checklist on the package card.
            </p>
            <div className="mb-3 space-y-2">
              {features.map((feature, index) => (
                <div key={index} className={`flex items-center gap-3 p-2.5 ${SOFT_PANEL}`}>
                  <Icon
                    name="check"
                    className="h-4 w-4 shrink-0 text-success-600 dark:text-success-300"
                    sw={2.6}
                  />
                  <span className="flex-1 text-sm text-ink-600 dark:text-ink-300">{feature}</span>
                  <button
                    type="button"
                    onClick={() => removeFeature(index)}
                    aria-label={`Remove ${feature}`}
                    className="grid h-7 w-7 place-items-center rounded-btn text-ink-400 transition hover:bg-danger-50 hover:text-danger-600 dark:text-ink-500 dark:hover:bg-danger-500/10 dark:hover:text-danger-300"
                  >
                    <Icon name="trash" className="h-4 w-4" sw={2} />
                  </button>
                </div>
              ))}
              {features.length === 0 ? (
                <p className="text-xs text-ink-400 dark:text-ink-500">
                  No perks yet — add the first below.
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <input
                value={featureInput}
                onChange={(event) => setFeatureInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addFeature();
                  }
                }}
                aria-label="New perk"
                placeholder="Add a perk and press Enter"
                disabled={atFeatureLimit}
                className={`${FIELD_CLASS} h-10 flex-1 disabled:opacity-50`}
              />
              <Btn
                type="button"
                v="outline"
                size="sm"
                icon="plus"
                onClick={addFeature}
                disabled={atFeatureLimit}
              >
                Add
              </Btn>
            </div>
            {atFeatureLimit ? (
              <p className="mt-1.5 text-[11px] text-ink-400 dark:text-ink-500">
                A package can have at most {MAX_PACKAGE_FEATURES} perks.
              </p>
            ) : null}
          </Card>

          {/* Visibility. */}
          <Card glow className="p-5 sm:p-6">
            <h3 className="font-display text-base font-bold tracking-tight text-ink-900 dark:text-white">
              Visibility
            </h3>
            <div className="mt-4 space-y-2.5">
              {[
                {
                  title: 'Active',
                  detail: 'Members can buy this package.',
                  on: active,
                  set: () => setActive((a) => !a),
                },
                {
                  title: 'Mark as popular',
                  detail: 'Highlights the package with a badge.',
                  on: popular,
                  set: () => setPopular((p) => !p),
                },
              ].map((row) => (
                <div key={row.title} className={`flex items-center gap-4 p-3.5 ${SOFT_PANEL}`}>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-ink-900 dark:text-white">
                      {row.title}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">{row.detail}</p>
                  </div>
                  <Switch checked={row.on} onChange={row.set} label={row.title} />
                </div>
              ))}
            </div>
          </Card>

          {error ? (
            <p
              role="alert"
              className="rounded-card border border-danger-500/30 bg-danger-500/10 px-3 py-2 text-sm text-danger-700 dark:text-danger-300"
            >
              {error}
            </p>
          ) : null}
        </div>

        {/* Live member-facing preview. */}
        <div className="space-y-3 lg:sticky lg:top-[88px]">
          <div className="flex items-center gap-2 px-1">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4 text-ink-500 dark:text-ink-400"
              aria-hidden
            >
              <path d={EYE_PATH} />
            </svg>
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-500 dark:text-ink-400">
              Member preview
            </span>
          </div>
          <Card glow className="p-5">
            <div
              aria-hidden
              className="pointer-events-none absolute -top-14 right-0 h-28 w-40 bg-brand-500/15 blur-3xl"
            />
            <div className="relative flex flex-wrap items-center gap-2">
              <span aria-hidden className="h-2.5 w-2.5 rounded-sm bg-brand-500" />
              <h3 className="font-display text-lg font-bold tracking-tight text-ink-900 dark:text-white">
                {name || 'Untitled package'}
              </h3>
              {popular ? <Badge tone="iris">Popular</Badge> : null}
            </div>
            {description ? (
              <p className="relative mt-1.5 text-xs text-ink-500 dark:text-ink-400">
                {description}
              </p>
            ) : null}
            <div className="relative mt-3 flex items-end gap-1">
              <span className="font-display text-4xl font-black tabular-nums tracking-tight text-ink-900 dark:text-white">
                {previewPrice}
              </span>
              <span className="mb-1.5 text-sm font-semibold text-ink-500 dark:text-ink-400">
                {previewUnit}
              </span>
            </div>
            <div className="relative mt-1 flex items-center gap-1.5 text-xs text-ink-500 dark:text-ink-400">
              {parsedSessions === null ? (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4 text-brand-600 dark:text-brand-300"
                  aria-hidden
                >
                  <path d={INFINITY_PATH} />
                </svg>
              ) : (
                <Icon name="ticket" className="h-4 w-4 text-brand-600 dark:text-brand-300" sw={2} />
              )}
              {previewSessions}
            </div>
            <div className="relative mt-4 space-y-1.5">
              {features.map((feature, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 text-sm text-ink-600 dark:text-ink-300"
                >
                  <Icon
                    name="check"
                    className="h-4 w-4 shrink-0 text-success-600 dark:text-success-300"
                    sw={2.6}
                  />
                  {feature}
                </div>
              ))}
            </div>
            <button
              type="button"
              tabIndex={-1}
              className="relative mt-5 h-11 w-full rounded-btn bg-[linear-gradient(135deg,#7C3AED,#EC4899)] text-sm font-semibold text-white shadow-[0_6px_20px_-8px_rgba(124,58,237,0.8)]"
            >
              Choose {name || 'package'}
            </button>
          </Card>
          <p className="text-center text-[11px] text-ink-400 dark:text-ink-500">
            This is how members see the package on the pricing page.
          </p>
        </div>
      </div>

      {/* Floating unsaved-changes save bar. */}
      <div
        className={`fixed bottom-5 left-1/2 z-40 -translate-x-1/2 transition-all duration-300 ${
          dirty || !isEdit
            ? 'translate-y-0 opacity-100'
            : 'pointer-events-none translate-y-4 opacity-0'
        }`}
      >
        <div className="flex items-center gap-3 rounded-card bg-ink-900 py-2.5 pl-4 pr-2.5 text-white shadow-[0_24px_60px_-16px_rgba(0,0,0,0.8)] ring-1 ring-white/10">
          <span className="relative grid h-2.5 w-2.5 place-items-center">
            {dirty ? (
              <span className="absolute inset-0 animate-ping rounded-full bg-warning-400 opacity-60" />
            ) : null}
            <span className="relative h-2.5 w-2.5 rounded-full bg-warning-400" />
          </span>
          <span className="text-sm font-medium text-ink-200">
            {dirty ? 'Unsaved changes' : 'New package'}
          </span>
          <div className="mx-0.5 h-5 w-px bg-white/15" />
          <button
            type="button"
            onClick={discard}
            disabled={pending}
            className="h-9 rounded-btn px-3 text-sm font-semibold text-ink-300 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
          >
            Discard
          </button>
          <Btn type="submit" v="primary" size="sm" icon="check" disabled={pending}>
            {pending ? 'Saving…' : isEdit ? 'Save package' : 'Create package'}
          </Btn>
        </div>
      </div>
    </form>
  );
}
