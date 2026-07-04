'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  MAX_SUBSCRIPTION_ALLOWANCE,
  MAX_SUBSCRIPTION_FEATURES,
  type SubscriptionInterval,
  type SubscriptionPlanStatus,
} from '@fit/types';
import { Badge, Btn, Card, Icon } from '@/components/ui';
import {
  SUBSCRIPTION_INTERVALS,
  creditsLabel,
  formatPrice,
  inputToMinor,
  intervalSuffix,
  minorToInput,
} from './format';
import { createSubscriptionPlanAction, updateSubscriptionPlanAction } from './actions';

/** Selectable initial statuses when creating (lifecycle change is a separate action). */
const CREATE_STATUSES: ReadonlyArray<{ value: SubscriptionPlanStatus; label: string }> = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
];

/** Shared field styling so create + edit render identically. */
const FIELD_CLASS =
  'w-full rounded-field border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/20 disabled:bg-ink-50 disabled:text-ink-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:disabled:bg-white/5';

/** Shared label styling. */
const LABEL_CLASS = 'text-sm font-medium text-ink-700 dark:text-ink-200';

/** Small uppercase section heading, matching the design's card headers. */
const CARD_HEADING_CLASS =
  'font-display text-base font-bold tracking-tight text-ink-900 dark:text-white';

type Initial = {
  name: string;
  description: string;
  priceAmount: number;
  currency: string;
  interval: SubscriptionInterval;
  features: string[];
  popular: boolean;
  freezeDaysPerPeriod: number;
  includedCredits: number;
  trialDays: number;
};

type Props =
  | { mode: 'create' }
  | {
      mode: 'edit';
      planId: string;
      initial: Initial;
    };

/** Clamp a raw number-input string to a non-negative integer allowance (blank → 0). */
function parseAllowance(value: string): number {
  const trimmed = value.trim();
  if (trimmed === '') {
    return 0;
  }
  const parsed = Math.floor(Number(trimmed));
  if (Number.isNaN(parsed) || parsed < 0) {
    return 0;
  }
  return Math.min(parsed, MAX_SUBSCRIPTION_ALLOWANCE);
}

/**
 * The create / edit subscription-plan form (T5.2), rebuilt to the formacore
 * `billing-plan-edit` artboard. One component serves both flows, laid out as the
 * design's two columns: a stack of grouped cards on the left and a live
 * member-facing plan preview on the right that updates as the staffer types.
 *
 * The cards mirror the artboard's sections:
 *
 *  • **Basics & pricing** — name, description, price + currency, renewal cadence.
 *  • **Access & credits** — the per-period class-credit allowance (`0` =
 *    unlimited) and the freeze allowance (`0` = freezing disabled).
 *  • **Perks** — a dynamic checklist of short perk labels (the plan's `features`);
 *    blank rows are dropped on submit.
 *  • **Visibility** — the "Most popular" flag, plus the initial status on create.
 *
 * On success it navigates to the plan's detail page; the discriminated
 * `ActionResult` surfaces any API error inline without throwing across the Server
 * Action boundary.
 */
export function SubscriptionPlanForm(props: Props) {
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
        interval: 'MONTH',
        features: [],
        popular: false,
        freezeDaysPerPeriod: 30,
        includedCredits: 0,
        trialDays: 0,
      };

  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [price, setPrice] = useState(initial.priceAmount ? minorToInput(initial.priceAmount) : '');
  const [currency, setCurrency] = useState(initial.currency);
  const [interval, setInterval] = useState<SubscriptionInterval>(initial.interval);
  const [features, setFeatures] = useState<string[]>(initial.features);
  const [popular, setPopular] = useState(initial.popular);
  const [freezeDays, setFreezeDays] = useState(String(initial.freezeDaysPerPeriod));
  const [credits, setCredits] = useState(String(initial.includedCredits));
  const [trialDays, setTrialDays] = useState(String(initial.trialDays));
  const [status, setStatus] = useState<SubscriptionPlanStatus>('ACTIVE');

  function setFeature(index: number, value: string): void {
    setFeatures((prev) => prev.map((feature, i) => (i === index ? value : feature)));
  }

  function addFeature(): void {
    setFeatures((prev) => (prev.length >= MAX_SUBSCRIPTION_FEATURES ? prev : [...prev, '']));
  }

  function removeFeature(index: number): void {
    setFeatures((prev) => prev.filter((_, i) => i !== index));
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setError(null);

    // Drop blank feature rows; trim the rest to the wire shape.
    const cleanedFeatures = features.map((feature) => feature.trim()).filter((f) => f.length > 0);

    const profile = {
      name,
      description,
      priceAmount: inputToMinor(price),
      currency,
      interval,
      features: cleanedFeatures,
      popular,
      freezeDaysPerPeriod: parseAllowance(freezeDays),
      includedCredits: parseAllowance(credits),
      trialDays: parseAllowance(trialDays),
    };

    startTransition(async () => {
      const result = isEdit
        ? await updateSubscriptionPlanAction(props.planId, profile)
        : await createSubscriptionPlanAction({ ...profile, status });
      if (result.ok) {
        router.push(`/subscriptions/${result.data.id}`);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  const cancelHref = isEdit ? `/subscriptions/${props.planId}` : '/subscriptions';
  const atFeatureLimit = features.length >= MAX_SUBSCRIPTION_FEATURES;

  // Live-preview values, derived from the current form state.
  const previewCredits = parseAllowance(credits);
  const previewFreeze = parseAllowance(freezeDays);
  const previewTrial = parseAllowance(trialDays);
  const previewPerks = features.map((f) => f.trim()).filter((f) => f.length > 0);

  return (
    <form
      onSubmit={onSubmit}
      className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]"
    >
      {/* ── form column ─────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-col gap-5">
        {/* Basics & pricing */}
        <Card className="p-5 sm:p-6">
          <h3 className={CARD_HEADING_CLASS}>Basics &amp; pricing</h3>
          <div className="mt-4 flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="plan-name" className={LABEL_CLASS}>
                Name
              </label>
              <input
                id="plan-name"
                name="name"
                type="text"
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="off"
                placeholder="e.g. Monthly Unlimited"
                className={FIELD_CLASS}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="plan-description" className={LABEL_CLASS}>
                Description <span className="font-normal text-ink-400">(optional)</span>
              </label>
              <textarea
                id="plan-description"
                name="description"
                rows={3}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="A short description of the plan."
                className={FIELD_CLASS}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_8rem_10rem]">
              <div className="flex flex-col gap-1">
                <label htmlFor="plan-price" className={LABEL_CLASS}>
                  Price
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
              <div className="flex flex-col gap-1">
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
              <div className="flex flex-col gap-1">
                <label htmlFor="plan-interval" className={LABEL_CLASS}>
                  Billing
                </label>
                <select
                  id="plan-interval"
                  name="interval"
                  value={interval}
                  onChange={(event) => setInterval(event.target.value as SubscriptionInterval)}
                  className={FIELD_CLASS}
                >
                  {SUBSCRIPTION_INTERVALS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </Card>

        {/* Access & credits */}
        <Card className="p-5 sm:p-6">
          <h3 className={CARD_HEADING_CLASS}>Access &amp; credits</h3>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="plan-credits" className={LABEL_CLASS}>
                Included credits
              </label>
              <input
                id="plan-credits"
                name="includedCredits"
                type="number"
                min="0"
                max={MAX_SUBSCRIPTION_ALLOWANCE}
                step="1"
                inputMode="numeric"
                value={credits}
                onChange={(event) => setCredits(event.target.value)}
                placeholder="0"
                className={`${FIELD_CLASS} font-mono tabular-nums`}
              />
              <p className="text-xs text-ink-400">0 = unlimited classes</p>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="plan-freeze" className={LABEL_CLASS}>
                Freeze days / period
              </label>
              <input
                id="plan-freeze"
                name="freezeDaysPerPeriod"
                type="number"
                min="0"
                max={MAX_SUBSCRIPTION_ALLOWANCE}
                step="1"
                inputMode="numeric"
                value={freezeDays}
                onChange={(event) => setFreezeDays(event.target.value)}
                placeholder="0"
                className={`${FIELD_CLASS} font-mono tabular-nums`}
              />
              <p className="text-xs text-ink-400">Max days a member can pause. 0 = no freezing.</p>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="plan-trial" className={LABEL_CLASS}>
                Free trial days
              </label>
              <input
                id="plan-trial"
                name="trialDays"
                type="number"
                min="0"
                max={MAX_SUBSCRIPTION_ALLOWANCE}
                step="1"
                inputMode="numeric"
                value={trialDays}
                onChange={(event) => setTrialDays(event.target.value)}
                placeholder="0"
                className={`${FIELD_CLASS} font-mono tabular-nums`}
              />
              <p className="text-xs text-ink-400">
                Free days before the first charge. 0 = no trial.
              </p>
            </div>
          </div>
        </Card>

        {/* Perks */}
        <Card className="p-5 sm:p-6">
          <h3 className={CARD_HEADING_CLASS}>Perks</h3>
          <p className="mt-0.5 text-sm text-ink-500 dark:text-ink-400">
            Shown as a checklist on the plan card.
          </p>
          <fieldset className="mt-3 flex flex-col gap-2">
            <legend className="sr-only">Perks</legend>
            {features.length > 0 ? (
              <div className="flex flex-col gap-2">
                {features.map((feature, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      type="text"
                      aria-label={`Perk ${index + 1}`}
                      value={feature}
                      onChange={(event) => setFeature(index, event.target.value)}
                      placeholder="e.g. Unlimited gym access"
                      className={FIELD_CLASS}
                    />
                    <Btn type="button" v="outline" size="md" onClick={() => removeFeature(index)}>
                      Remove
                    </Btn>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-400">
                No perks yet. Add the perks this plan includes as bullet points.
              </p>
            )}
            <div>
              <Btn
                type="button"
                v="outline"
                size="sm"
                icon="plus"
                onClick={addFeature}
                disabled={atFeatureLimit}
              >
                {atFeatureLimit ? `Maximum of ${MAX_SUBSCRIPTION_FEATURES} perks` : 'Add perk'}
              </Btn>
            </div>
          </fieldset>
        </Card>

        {/* Visibility */}
        <Card className="p-5 sm:p-6">
          <h3 className={CARD_HEADING_CLASS}>Visibility</h3>
          <label className="mt-4 flex items-center gap-3 text-sm font-medium text-ink-700 dark:text-ink-200">
            <input
              type="checkbox"
              name="popular"
              checked={popular}
              onChange={(event) => setPopular(event.target.checked)}
              className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-400 dark:border-white/20 dark:bg-white/10"
            />
            <span>
              Mark as “Most popular”
              <span className="mt-0.5 block text-xs font-normal text-ink-400">
                Highlights the plan with a badge on the pricing page.
              </span>
            </span>
          </label>

          {!isEdit ? (
            <div className="mt-4 flex flex-col gap-1">
              <label htmlFor="plan-status" className={LABEL_CLASS}>
                Status
              </label>
              <select
                id="plan-status"
                name="status"
                value={status}
                onChange={(event) => setStatus(event.target.value as SubscriptionPlanStatus)}
                className={`${FIELD_CLASS} sm:max-w-xs`}
              >
                {CREATE_STATUSES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-ink-400">Members can only subscribe to an active plan.</p>
            </div>
          ) : null}
        </Card>

        {error ? (
          <p
            role="alert"
            className="rounded-card border border-danger-500/30 bg-danger-500/10 px-3 py-2 text-sm text-danger-700 dark:text-danger-300"
          >
            {error}
          </p>
        ) : null}

        <div className="flex items-center gap-3">
          <Btn type="submit" v="primary" size="md" disabled={pending}>
            {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create plan'}
          </Btn>
          <Link
            href={cancelHref}
            className="text-sm font-medium text-ink-500 hover:text-ink-700 dark:text-ink-400 dark:hover:text-ink-200"
          >
            Cancel
          </Link>
        </div>
      </div>

      {/* ── live member preview ─────────────────────────────────────── */}
      <aside className="flex flex-col gap-3 lg:sticky lg:top-6">
        <div className="flex items-center gap-2 px-1">
          <Icon name="star" className="h-4 w-4 text-ink-400" sw={2} />
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-500 dark:text-ink-400">
            Member preview
          </span>
        </div>
        <Card className="p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-lg font-bold tracking-tight text-ink-900 dark:text-white">
              {name.trim() || 'Untitled plan'}
            </h3>
            {popular ? (
              <Badge tone="iris" icon="star">
                Popular
              </Badge>
            ) : null}
          </div>
          {description.trim() ? (
            <p className="mt-1.5 text-xs text-ink-500 dark:text-ink-400">{description.trim()}</p>
          ) : null}

          <div className="mt-3 flex items-end gap-1">
            <span className="font-display text-4xl font-black tabular-nums tracking-tight text-ink-900 dark:text-white">
              {formatPrice(inputToMinor(price), currency || 'USD')}
            </span>
            <span className="mb-1.5 text-sm font-semibold text-ink-500 dark:text-ink-400">
              {intervalSuffix(interval)}
            </span>
          </div>

          <div className="mt-1 flex items-center gap-1.5 text-xs text-ink-500 dark:text-ink-400">
            <Icon
              name={previewCredits > 0 ? 'ticket' : 'spark'}
              className="h-4 w-4 text-brand-600 dark:text-brand-300"
              sw={2}
            />
            {creditsLabel(previewCredits)}
          </div>

          {previewTrial > 0 || previewFreeze > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {previewTrial > 0 ? (
                <span className="inline-flex h-6 items-center gap-1 rounded-pill bg-brand-500/10 px-2 text-[11px] font-semibold text-brand-700 ring-1 ring-inset ring-brand-500/20 dark:text-brand-300">
                  <Icon name="spark" className="h-3 w-3" sw={2} />
                  {previewTrial}-day free trial
                </span>
              ) : null}
              {previewFreeze > 0 ? (
                <span className="inline-flex h-6 items-center gap-1 rounded-pill px-2 text-[11px] font-semibold text-ink-600 ring-1 ring-inset ring-ink-200 dark:text-ink-300 dark:ring-white/10">
                  <Icon name="clock" className="h-3 w-3" sw={2} />
                  {previewFreeze}d freeze
                </span>
              ) : null}
            </div>
          ) : null}

          {previewPerks.length > 0 ? (
            <div className="mt-4 space-y-1.5">
              {previewPerks.map((perk, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 text-sm text-ink-600 dark:text-ink-300"
                >
                  <Icon
                    name="check"
                    className="h-4 w-4 shrink-0 text-success-600 dark:text-success-300"
                    sw={2.6}
                  />
                  {perk}
                </div>
              ))}
            </div>
          ) : null}
        </Card>
        <p className="text-center text-[11px] text-ink-400">
          This is roughly how members see the plan on the pricing page.
        </p>
      </aside>
    </form>
  );
}
