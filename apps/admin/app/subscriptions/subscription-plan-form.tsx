'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  MAX_SUBSCRIPTION_FEATURES,
  type SubscriptionInterval,
  type SubscriptionPlanStatus,
} from '@fit/types';
import { SUBSCRIPTION_INTERVALS, inputToMinor, minorToInput } from './format';
import { createSubscriptionPlanAction, updateSubscriptionPlanAction } from './actions';

/** Selectable initial statuses when creating (lifecycle change is a separate action). */
const CREATE_STATUSES: ReadonlyArray<{ value: SubscriptionPlanStatus; label: string }> = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
];

/** Shared field styling so create + edit render identically. */
const FIELD_CLASS =
  'w-full rounded-card border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400 disabled:bg-slate-50 disabled:text-slate-500';

type Initial = {
  name: string;
  description: string;
  priceAmount: number;
  currency: string;
  interval: SubscriptionInterval;
  features: string[];
  popular: boolean;
};

type Props =
  | { mode: 'create' }
  | {
      mode: 'edit';
      planId: string;
      initial: Initial;
    };

/**
 * The create / edit subscription-plan form (T8.2). One component serves both
 * flows. Beyond the profile fields (name, description, price, currency) it owns:
 *
 *  • A renewal cadence select (`Monthly` / `Yearly`).
 *  • A "Most popular" toggle for the emphasised plan.
 *  • A features editor — a dynamic list of short perk labels rendered as bullets
 *    on the storefront; blank rows are dropped on submit.
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
      };

  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [price, setPrice] = useState(initial.priceAmount ? minorToInput(initial.priceAmount) : '');
  const [currency, setCurrency] = useState(initial.currency);
  const [interval, setInterval] = useState<SubscriptionInterval>(initial.interval);
  const [features, setFeatures] = useState<string[]>(initial.features);
  const [popular, setPopular] = useState(initial.popular);
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

  return (
    <form onSubmit={onSubmit} className="flex max-w-2xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="plan-name" className="text-sm font-medium text-slate-700">
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
        <label htmlFor="plan-description" className="text-sm font-medium text-slate-700">
          Description <span className="font-normal text-slate-400">(optional)</span>
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

      <div className="flex flex-wrap gap-4">
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="plan-price" className="text-sm font-medium text-slate-700">
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
            className={FIELD_CLASS}
          />
        </div>
        <div className="flex w-32 flex-col gap-1">
          <label htmlFor="plan-currency" className="text-sm font-medium text-slate-700">
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
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="plan-interval" className="text-sm font-medium text-slate-700">
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

      {/* Features. */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-slate-700">
          Features <span className="font-normal text-slate-400">(optional)</span>
        </legend>
        {features.length > 0 ? (
          <div className="flex flex-col gap-2">
            {features.map((feature, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  type="text"
                  aria-label={`Feature ${index + 1}`}
                  value={feature}
                  onChange={(event) => setFeature(index, event.target.value)}
                  placeholder="e.g. Unlimited gym access"
                  className={FIELD_CLASS}
                />
                <button
                  type="button"
                  onClick={() => removeFeature(index)}
                  className="rounded-card border border-slate-200 px-3 py-2 text-sm font-medium text-slate-500 hover:text-red-600"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400">
            No features. Add the perks this plan includes as bullet points.
          </p>
        )}
        <div>
          <button
            type="button"
            onClick={addFeature}
            disabled={atFeatureLimit}
            className="rounded-card border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {atFeatureLimit ? `Maximum of ${MAX_SUBSCRIPTION_FEATURES} features` : 'Add feature'}
          </button>
        </div>
      </fieldset>

      <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
        <input
          type="checkbox"
          name="popular"
          checked={popular}
          onChange={(event) => setPopular(event.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
        />
        Mark as “Most popular”
      </label>

      {!isEdit ? (
        <div className="flex flex-col gap-1">
          <label htmlFor="plan-status" className="text-sm font-medium text-slate-700">
            Status
          </label>
          <select
            id="plan-status"
            name="status"
            value={status}
            onChange={(event) => setStatus(event.target.value as SubscriptionPlanStatus)}
            className={FIELD_CLASS}
          >
            {CREATE_STATUSES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-card bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-card bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create plan'}
        </button>
        <Link href={cancelHref} className="text-sm font-medium text-slate-500 hover:text-slate-700">
          Cancel
        </Link>
      </div>
    </form>
  );
}
