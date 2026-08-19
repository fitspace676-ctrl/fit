'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { InvoiceType } from '@fit/types';
import { Button, Card } from '@fit/ui-kit';
import { Icon } from '@/components/ui';
import { inputToMinor } from '../format';
import { INVOICE_TYPES, todayIsoDate } from './format';
import {
  createInvoiceAction,
  searchMembersForInvoiceAction,
  type InvoiceMemberMatch,
} from './actions';

/** Currency every hand-raised invoice is issued in, matching the plans form. */
const CURRENCY = 'GEL';

/** How long the member search waits after the last keystroke before querying. */
const SEARCH_DEBOUNCE_MS = 250;

/** Shared field styling, matching the plans form so the two drawers feel the same. */
const FIELD_CLASS =
  'w-full rounded-field border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/20 disabled:bg-ink-50 disabled:text-ink-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:disabled:bg-white/5';

/** Shared label styling. */
const LABEL_CLASS = 'text-sm font-medium text-ink-700 dark:text-ink-200';

/** Small section heading, matching the design's card headers. */
const CARD_HEADING_CLASS =
  'font-display text-base font-bold tracking-tight text-ink-900 dark:text-white';

/**
 * Raise an invoice by hand.
 *
 * Staff raise the document and nothing more — there is no settlement state to pick.
 * The API starts every hand-raised invoice `PENDING`, since raising one is asking to
 * be paid. The due date is optional and independent of that.
 *
 * The member is chosen through a debounced typeahead rather than a `<select>`: a gym's
 * roster is far too long to render as options, and staff know the name they're looking
 * for. `onSuccess` / `onCancel` are the drawer contract used across the console — the
 * form reports completion to its host instead of navigating.
 */
export function InvoiceForm({
  onSuccess,
  onCancel,
}: {
  onSuccess?: (summary: { number: string }) => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [member, setMember] = useState<InvoiceMemberMatch | null>(null);
  const [memberQuery, setMemberQuery] = useState('');
  const [matches, setMatches] = useState<InvoiceMemberMatch[]>([]);
  const [searching, setSearching] = useState(false);

  const [type, setType] = useState<InvoiceType>('MEMBERSHIP');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [issuedAt, setIssuedAt] = useState(todayIsoDate());

  // Debounced member search. The generation counter drops a slow response that lands
  // after a newer keystroke, so the list never flickers back to stale matches.
  const searchGeneration = useRef(0);
  useEffect(() => {
    const trimmed = memberQuery.trim();
    if (member || trimmed.length === 0) {
      setMatches([]);
      setSearching(false);
      return;
    }
    const generation = ++searchGeneration.current;
    setSearching(true);
    const timer = setTimeout(() => {
      void searchMembersForInvoiceAction(trimmed).then((result) => {
        if (generation !== searchGeneration.current) return;
        setSearching(false);
        setMatches(result.ok ? result.data : []);
        if (!result.ok) setError(result.error);
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [memberQuery, member]);

  function pickMember(match: InvoiceMemberMatch): void {
    setMember(match);
    setMemberQuery('');
    setMatches([]);
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setError(null);

    if (!member) {
      setError('Pick the member this invoice is for.');
      return;
    }

    startTransition(async () => {
      const result = await createInvoiceAction({
        memberId: member.id,
        type,
        description,
        amount: inputToMinor(price),
        currency: CURRENCY,
        // Optional — an invoice with no stated deadline is a normal thing to raise.
        dueDate: dueDate || undefined,
        issuedAt,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSuccess?.({ number: result.data.number });
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      {/* Who + what */}
      <Card>
        <h3 className={CARD_HEADING_CLASS}>Member</h3>

        {member ? (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-field border border-ink-200 px-3.5 py-2.5 dark:border-white/10">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-ink-900 dark:text-white">
                {member.name}
              </div>
              {member.email ? (
                <div className="truncate text-xs text-ink-500 dark:text-ink-400">
                  {member.email}
                </div>
              ) : (
                <div className="text-xs text-warning-600 dark:text-warning-400">
                  No email address - this invoice can be downloaded but not sent.
                </div>
              )}
            </div>
            <Button
              variant="ghost"
              size="inline"
              type="button"
              onClick={() => setMember(null)}
              label="Change"
            />
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-1">
            <label htmlFor="invoice-member" className={LABEL_CLASS}>
              Search by name or email
            </label>
            <input
              id="invoice-member"
              type="text"
              value={memberQuery}
              onChange={(event) => setMemberQuery(event.target.value)}
              placeholder="Start typing a member's name…"
              autoComplete="off"
              className={FIELD_CLASS}
            />
            {searching ? (
              <p className="text-xs text-ink-400">Searching…</p>
            ) : matches.length > 0 ? (
              <ul className="mt-1 flex flex-col overflow-hidden rounded-field border border-ink-200 dark:border-white/10">
                {matches.map((match) => (
                  <li key={match.id}>
                    <button
                      type="button"
                      onClick={() => pickMember(match)}
                      className="flex w-full flex-col items-start px-3.5 py-2 text-left hover:bg-ink-50 dark:hover:bg-white/[0.06]"
                    >
                      <span className="text-sm font-medium text-ink-900 dark:text-white">
                        {match.name}
                      </span>
                      {match.email ? (
                        <span className="text-xs text-ink-500 dark:text-ink-400">
                          {match.email}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : memberQuery.trim() ? (
              <p className="text-xs text-ink-400">No members match that.</p>
            ) : null}
          </div>
        )}
      </Card>

      {/* What is being billed */}
      <Card>
        <h3 className={CARD_HEADING_CLASS}>Details</h3>
        <div className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="invoice-type" className={LABEL_CLASS}>
              Type
            </label>
            <select
              id="invoice-type"
              value={type}
              onChange={(event) => setType(event.target.value as InvoiceType)}
              className={FIELD_CLASS}
            >
              {INVOICE_TYPES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="invoice-description" className={LABEL_CLASS}>
              Description
            </label>
            <textarea
              id="invoice-description"
              rows={3}
              required
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="e.g. Personal training block - 10 sessions"
              className={FIELD_CLASS}
            />
            <p className="text-xs text-ink-400">This is the line the member sees on the PDF.</p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="invoice-amount" className={LABEL_CLASS}>
                Amount
              </label>
              <div className="relative">
                <input
                  id="invoice-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  required
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                  placeholder="0.00"
                  className={`${FIELD_CLASS} pr-14 font-mono tabular-nums`}
                />
                <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-sm font-semibold text-ink-400">
                  {CURRENCY}
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="invoice-issued" className={LABEL_CLASS}>
                Issue date
              </label>
              <input
                id="invoice-issued"
                type="date"
                required
                value={issuedAt}
                onChange={(event) => setIssuedAt(event.target.value)}
                className={FIELD_CLASS}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="invoice-due" className={LABEL_CLASS}>
                Due date <span className="font-normal text-ink-400">(optional)</span>
              </label>
              <input
                id="invoice-due"
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                className={FIELD_CLASS}
              />
              <p className="text-xs text-ink-400">Leave blank if the invoice states no deadline.</p>
            </div>
          </div>
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

      <div
        className="sticky bottom-0 z-10 -mx-6 -mb-6 flex items-center gap-3 border-t border-ink-200 px-6 py-4 dark:border-white/10"
        style={{ backgroundColor: 'var(--color-background-body)' }}
      >
        <Button
          variant="primary"
          size="card"
          type="submit"
          disabled={pending}
          label={pending ? 'Creating…' : 'Create invoice'}
        />
        {onCancel ? (
          <Button
            variant="ghost"
            size="card"
            type="button"
            onClick={onCancel}
            disabled={pending}
            label="Cancel"
          />
        ) : null}
        <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-ink-400">
          <Icon name="info" className="h-3.5 w-3.5" sw={2} />
          Numbered automatically
        </span>
      </div>
    </form>
  );
}
