'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  MAX_SUBSCRIPTION_ALLOWANCE,
  type SubscriptionInterval,
  type SubscriptionPlanStatus,
} from '@fit/types';
import { Badge, Button, Card } from '@fit/ui-kit';
import { Icon } from '@/components/ui';
import { useGymCurrency } from '@/components/gym-currency';
import {
  SUBSCRIPTION_INTERVALS,
  formatPrice,
  inputToMinor,
  intervalSuffix,
  minorToInput,
} from './format';
import {
  createSubscriptionPlanAction,
  setPlanClassTypesAction,
  updateSubscriptionPlanAction,
} from './actions';

/**
 * One class type the plan can cover. Only `FREE` and `INCLUDED` types are ever
 * passed: a `PAID` type carries a per-session price that being pulled into a plan
 * would strip, so it stays editable from the classes screen alone.
 *
 * `includedPlanIds` is the type's current coverage — it seeds the picker when
 * editing a plan.
 */
export type PlanClassTypeOption = {
  id: string;
  name: string;
  color: string;
  includedPlanIds: string[];
};

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

/**
 * `onSuccess` / `onCancel` are the drawer contract (mirroring `ProductForm` and
 * `MemberForm`): pass them and the form reports completion to its host instead of
 * navigating, and lays itself out for a drawer (one column with the preview stacked
 * under the fields, a sticky footer, Cancel as a button rather than a link back to a
 * page). Omit them and it behaves as a standalone page form.
 */
type Props = {
  /**
   * The class types this plan may cover. Empty is normal — a gym that hasn't built
   * its class catalogue, or one whose classes are all paid per session — and the
   * picker says so rather than rendering an empty row of chips.
   */
  classTypes: PlanClassTypeOption[];
} & (
  | { mode: 'create'; onSuccess?: () => void; onCancel?: () => void }
  | {
      mode: 'edit';
      planId: string;
      initial: Initial;
      onSuccess?: () => void;
      onCancel?: () => void;
    }
);

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
 * The cards:
 *
 *  • **Basics & pricing** — name, description, price (in a fixed currency, GEL for
 *    a new plan) and renewal cadence.
 *  • **Included classes** — which class types the plan covers. Saved as a second
 *    write, since the relation lives on the class type (see
 *    {@link setPlanClassTypesAction}), not on the plan.
 *  • **Freeze policy** — the freeze allowance (`0` = freezing disabled).
 *  • **Visibility** — the "Most popular" flag, plus the initial status on create.
 *
 * The per-period credit allowance, the free trial and the perk list were dropped
 * from the form; their columns survive untouched, so an edit round-trips whatever
 * the plan already holds.
 *
 * On success it navigates to the plan's detail page — unless hosted in a drawer
 * (see {@link Props}), where it hands control back to the host instead. The
 * discriminated `ActionResult` surfaces any API error inline without throwing
 * across the Server Action boundary.
 */
export function SubscriptionPlanForm(props: Props) {
  const router = useRouter();
  const gymCurrency = useGymCurrency();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isEdit = props.mode === 'edit';
  // The two-column layout keys off viewport breakpoints, so inside a ~42rem drawer
  // it would squeeze the fields against the preview. Drawer mode stacks instead.
  const inDrawer = Boolean(props.onCancel);
  const initial: Initial = isEdit
    ? props.initial
    : {
        name: '',
        description: '',
        priceAmount: 0,
        currency: gymCurrency,
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
  const [interval, setInterval] = useState<SubscriptionInterval>(initial.interval);
  const [popular, setPopular] = useState(initial.popular);
  const [freezeDays, setFreezeDays] = useState(String(initial.freezeDaysPerPeriod));
  const [status, setStatus] = useState<SubscriptionPlanStatus>('ACTIVE');
  const [classTypeIds, setClassTypeIds] = useState<string[]>(() =>
    isEdit
      ? props.classTypes.filter((t) => t.includedPlanIds.includes(props.planId)).map((t) => t.id)
      : [],
  );

  /**
   * Set once a create succeeds. The plan write and the class-coverage write are two
   * round-trips, so if the second fails the plan already exists — re-submitting must
   * then edit that plan rather than create a duplicate.
   */
  const [createdPlanId, setCreatedPlanId] = useState<string | null>(null);

  /**
   * Fixed for the lifetime of the form: a new plan is priced in the gym's own
   * configured currency (Settings → General), an existing one keeps its stored
   * code. A free-text ISO field was only ever a way to typo a plan into a currency
   * the gym does not sell in; the API stamps the gym's currency on create either way.
   */
  const currency = initial.currency;

  function onSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setError(null);

    const profile = {
      name,
      description,
      priceAmount: inputToMinor(price),
      interval,
      // Perks, the credit allowance and the trial were dropped from the form. The
      // columns still exist, so an edit round-trips whatever the plan already holds
      // rather than blanking it; a new plan takes the schema defaults.
      features: initial.features,
      popular,
      freezeDaysPerPeriod: parseAllowance(freezeDays),
      includedCredits: initial.includedCredits,
      trialDays: initial.trialDays,
    };

    startTransition(async () => {
      // `createdPlanId` is set only when a previous submit created the plan but the
      // class sync then failed — editing it is what stops a retry duplicating it.
      const existingId = isEdit ? props.planId : createdPlanId;
      const result = existingId
        ? await updateSubscriptionPlanAction(existingId, profile)
        : await createSubscriptionPlanAction({ ...profile, status });
      if (!result.ok) {
        setError(result.error);
        return;
      }

      const planId = result.data.id;
      if (!existingId) {
        setCreatedPlanId(planId);
      }

      // Coverage lives on the class types, so it is a second write — and one the
      // plan's own id is a prerequisite for, which is why it can't be folded into
      // the create above.
      const coverage = await setPlanClassTypesAction(planId, classTypeIds);
      if (!coverage.ok) {
        // The plan itself is saved; only the class links failed. Say so rather than
        // reporting a clean success or a total failure, since neither is true.
        setError(
          `The plan was saved, but its classes could not be updated: ${coverage.error} — set them from the Classes screen, or try saving again.`,
        );
        router.refresh();
        return;
      }

      if (props.onSuccess) {
        props.onSuccess();
      } else {
        router.push(`/payments/${planId}`);
      }
      // Either way the catalogue behind the form is now stale.
      router.refresh();
    });
  }

  function toggleClassType(id: string): void {
    setClassTypeIds((prev) =>
      prev.includes(id) ? prev.filter((current) => current !== id) : [...prev, id],
    );
  }

  const cancelHref = isEdit ? `/payments/${props.planId}` : '/payments';

  // Live-preview values, derived from the current form state.
  const previewFreeze = parseAllowance(freezeDays);
  const previewClasses = props.classTypes.filter((type) => classTypeIds.includes(type.id));

  // Submit + Cancel. On a page they close the left column; in a drawer they pin to
  // the bottom of the scroll area, below the stacked preview. The sticky footer
  // borrows the drawer's own body colour so scrolled content can't show through.
  const actions = (
    <div
      className={
        inDrawer
          ? 'sticky bottom-0 z-10 -mx-6 -mb-6 flex items-center gap-3 border-t border-ink-200 px-6 py-4 dark:border-white/10'
          : 'flex items-center gap-3'
      }
      style={inDrawer ? { backgroundColor: 'var(--color-background-body)' } : undefined}
    >
      <Button
        variant="primary"
        size="card"
        type="submit"
        disabled={pending}
        label={pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create plan'}
      />
      {props.onCancel ? (
        <Button
          variant="ghost"
          size="card"
          type="button"
          onClick={props.onCancel}
          disabled={pending}
          label="Cancel"
        />
      ) : (
        <Link
          href={cancelHref}
          className="text-sm font-medium text-ink-500 hover:text-ink-700 dark:text-ink-400 dark:hover:text-ink-200"
        >
          Cancel
        </Link>
      )}
    </div>
  );

  return (
    <form
      onSubmit={onSubmit}
      className={
        inDrawer
          ? 'flex flex-col gap-5'
          : 'grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]'
      }
    >
      {/* ── form column ─────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-col gap-5">
        {/* Basics & pricing */}
        <Card>
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

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
              <div className="flex flex-col gap-1">
                <label htmlFor="plan-price" className={LABEL_CLASS}>
                  Price
                </label>
                <div className="relative">
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
                    className={`${FIELD_CLASS} pr-14 font-mono tabular-nums`}
                  />
                  {/* Currency is fixed, so it reads as a unit on the amount rather
                      than a field of its own. */}
                  <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-sm font-semibold text-ink-400">
                    {currency}
                  </span>
                </div>
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

        {/* Included classes */}
        <Card>
          <h3 className={CARD_HEADING_CLASS}>Included classes</h3>
          <p className="mt-0.5 text-sm text-ink-500 dark:text-ink-400">
            Pick the classes this plan covers. Members on it book them without paying per session.
          </p>
          {props.classTypes.length === 0 ? (
            <p className="mt-3 text-sm text-ink-400">
              No class types to include yet. Classes priced per session keep their own price and are
              set from the Classes screen.
            </p>
          ) : (
            <fieldset className="mt-3 flex flex-wrap gap-2">
              <legend className="sr-only">Included classes</legend>
              {props.classTypes.map((type) => {
                const active = classTypeIds.includes(type.id);
                return (
                  <button
                    key={type.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleClassType(type.id)}
                    className={[
                      'inline-flex h-9 items-center gap-2 rounded-pill px-3.5 text-sm font-semibold ring-1 ring-inset transition',
                      active
                        ? 'bg-brand-500/10 text-brand-700 ring-brand-500/30 dark:text-brand-300'
                        : 'text-ink-600 ring-ink-200 hover:text-ink-900 dark:text-ink-300 dark:ring-white/10 dark:hover:text-white',
                    ].join(' ')}
                  >
                    {active ? (
                      <Icon
                        name="check"
                        className="h-3.5 w-3.5 text-brand-600 dark:text-brand-300"
                        sw={2.6}
                      />
                    ) : (
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: type.color }}
                      />
                    )}
                    {type.name}
                  </button>
                );
              })}
            </fieldset>
          )}
        </Card>

        {/* Freeze policy */}
        <Card>
          <h3 className={CARD_HEADING_CLASS}>Freeze policy</h3>
          <div className="mt-4 flex flex-col gap-1 sm:max-w-xs">
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
        </Card>

        {/* Visibility */}
        <Card>
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

        {inDrawer ? null : actions}
      </div>

      {/* ── live member preview ─────────────────────────────────────── */}
      <aside
        className={inDrawer ? 'flex flex-col gap-3' : 'flex flex-col gap-3 lg:sticky lg:top-6'}
      >
        <div className="flex items-center gap-2 px-1">
          <Icon name="star" className="h-4 w-4 text-ink-400" sw={2} />
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-500 dark:text-ink-400">
            Member preview
          </span>
        </div>
        <Card>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-lg font-bold tracking-tight text-ink-900 dark:text-white">
              {name.trim() || 'Untitled plan'}
            </h3>
            {popular ? <Badge tone="neutral" icon="star" label="Popular" /> : null}
          </div>
          {description.trim() ? (
            <p className="mt-1.5 text-xs text-ink-500 dark:text-ink-400">{description.trim()}</p>
          ) : null}

          <div className="mt-3 flex items-end gap-1">
            <span className="font-display text-4xl font-black tabular-nums tracking-tight text-ink-900 dark:text-white">
              {formatPrice(inputToMinor(price), currency)}
            </span>
            <span className="mb-1.5 text-sm font-semibold text-ink-500 dark:text-ink-400">
              {intervalSuffix(interval)}
            </span>
          </div>

          {previewFreeze > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className="inline-flex h-6 items-center gap-1 rounded-pill px-2 text-[11px] font-semibold text-ink-600 ring-1 ring-inset ring-ink-200 dark:text-ink-300 dark:ring-white/10">
                <Icon name="clock" className="h-3 w-3" sw={2} />
                {previewFreeze}d freeze
              </span>
            </div>
          ) : null}

          {previewClasses.length > 0 ? (
            <div className="mt-4 space-y-1.5">
              {previewClasses.map((type) => (
                <div
                  key={type.id}
                  className="flex items-center gap-2 text-sm text-ink-600 dark:text-ink-300"
                >
                  <Icon
                    name="check"
                    className="h-4 w-4 shrink-0 text-success-600 dark:text-success-300"
                    sw={2.6}
                  />
                  {type.name}
                </div>
              ))}
            </div>
          ) : null}
        </Card>
        <p className="text-center text-[11px] text-ink-400">
          This is roughly how members see the plan on the pricing page.
        </p>
      </aside>

      {inDrawer ? actions : null}
    </form>
  );
}
