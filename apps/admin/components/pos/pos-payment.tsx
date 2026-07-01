'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { PaymentMethod, PosReceipt } from '@fit/types';
import { formatPrice, inputToMinor, minorToInput } from '@/app/(dashboard)/products/format-price';
import {
  emailReceiptAction,
  recordPosSaleAction,
  type PosMemberRow,
} from '@/app/(dashboard)/pos/actions';
import { Btn, Card, Icon } from '@/components/ui';
import {
  lineTotal,
  selectChangeDue,
  selectDiscountTotal,
  selectItemCount,
  selectSubtotal,
  selectTotal,
  usePosCart,
} from '@/stores/pos-cart-store';

/** A finished sale, snapshotted at completion so the success screen survives the cart reset. */
interface CompletedSale {
  method: PaymentMethod;
  total: number;
  tendered: number;
  change: number;
  currency: string;
  itemCount: number;
  memberName: string | null;
  /** The member's address, pre-filled into the receipt field (`null` for a walk-in). */
  memberEmail: string | null;
  /** The validated sale snapshot the receipt email is rendered from. */
  receipt: PosReceipt;
}

/** The three settlement methods, with the copy the buttons render. */
const METHODS: ReadonlyArray<{ method: PaymentMethod; label: string; hint: string }> = [
  { method: 'cash', label: 'Cash', hint: 'Tendered at the desk' },
  { method: 'card', label: 'Card', hint: 'Card terminal' },
  { method: 'member_account', label: 'Member account', hint: 'Charge to house account' },
];

/** Round-up suggestions offered as quick-tender chips, in minor units (5 / 10 / 20 / 50). */
const QUICK_TENDER_STEPS = [500, 1000, 2000, 5000];

/**
 * The POS payment modal (T7.3). Opens from the cart's "Charge" button and walks
 * the operator through settling the sale: pick cash / card / member account, and
 * for cash enter the amount handed over to see the change due live. "Member
 * account" is only selectable when a member is attached (a walk-in has no account
 * to charge). Completing the sale snapshots a {@link CompletedSale} for the
 * confirmation screen, then `onCompleted` lets the board reset the cart.
 *
 * The confirmation screen offers to email the customer a receipt (T7.4) — the
 * snapshot is sent to `POST /orders/receipt`, which renders + delivers it. The
 * settlement itself is still recorded client-side; persisting an Order + Payment
 * row and the end-of-day reconciliation (T7.5) build on the same snapshot.
 */
export function PosPayment({
  member,
  onClose,
  onCompleted,
}: {
  member: PosMemberRow | null;
  onClose: () => void;
  onCompleted: () => void;
}) {
  const items = usePosCart((state) => state.items);
  const total = usePosCart(selectTotal);
  const subtotal = usePosCart(selectSubtotal);
  const discountTotal = usePosCart(selectDiscountTotal);
  const changeDue = usePosCart(selectChangeDue);
  const itemCount = usePosCart(selectItemCount);
  const currency = usePosCart((state) => state.items[0]?.currency ?? 'USD');
  const method = usePosCart((state) => state.paymentMethod);
  const cashTendered = usePosCart((state) => state.cashTendered);
  const setPaymentMethod = usePosCart((state) => state.setPaymentMethod);
  const setCashTendered = usePosCart((state) => state.setCashTendered);

  const [completed, setCompleted] = useState<CompletedSale | null>(null);
  // Persisting the sale (T7.5) is the source of truth for the end-of-day
  // reconciliation, so completion blocks on it: `saving` while it is in flight,
  // an error string to surface (and let the operator retry) on failure.
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Move focus into the dialog on open so keyboard operators land inside it.
  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  const cashShort = method === 'cash' && cashTendered < total;
  const canComplete =
    total > 0 &&
    method !== null &&
    !cashShort &&
    !(method === 'member_account' && member === null) &&
    !saving;

  const quickTenders = useMemo(() => {
    const suggestions = new Set<number>([total]);
    for (const step of QUICK_TENDER_STEPS) {
      suggestions.add(Math.ceil(total / step) * step);
    }
    return [...suggestions].filter((amount) => amount >= total).sort((a, b) => a - b);
  }, [total]);

  async function complete(): Promise<void> {
    if (method === null || !canComplete) {
      return;
    }
    const tendered = method === 'cash' ? cashTendered : total;
    const change = method === 'cash' ? changeDue : 0;
    const receipt: PosReceipt = {
      currency,
      items: items.map((item) => ({
        name: item.name,
        quantity: item.qty,
        unitPrice: item.unitPrice,
        amount: lineTotal(item),
      })),
      subtotal,
      discountTotal,
      total,
      paymentMethod: method,
      cashTendered: tendered,
      changeDue: change,
      memberName: member?.name ?? null,
    };

    setSaving(true);
    setSaveError(null);
    const result = await recordPosSaleAction({ memberId: member?.id ?? null, receipt });
    setSaving(false);
    if (!result.ok) {
      setSaveError(result.error);
      return;
    }

    setCompleted({
      method,
      total,
      tendered,
      change,
      currency,
      itemCount,
      memberName: member?.name ?? null,
      memberEmail: member?.email ?? null,
      receipt,
    });
  }

  function finish(): void {
    onCompleted();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Take payment"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="flex w-full max-w-md flex-col gap-4 rounded-card border border-ink-200 bg-white p-5 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.5)] focus:outline-none dark:border-white/10 dark:bg-ink-900 dark:shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)] dark:backdrop-blur-xl"
      >
        {completed ? (
          <PaymentSuccess sale={completed} onFinish={finish} />
        ) : (
          <>
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-lg font-extrabold tracking-tight text-ink-900 dark:text-white">
                Take payment
              </h2>
              <span className="font-mono text-2xl font-bold tabular-nums text-ink-900 dark:text-white">
                {formatPrice(total, currency)}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {METHODS.map(({ method: value, label, hint }) => {
                const disabled = value === 'member_account' && member === null;
                const selected = method === value;
                return (
                  <button
                    key={value}
                    type="button"
                    disabled={disabled}
                    aria-pressed={selected}
                    onClick={() => setPaymentMethod(value)}
                    className={`flex flex-col items-center gap-1 rounded-card border p-3 text-center transition ${
                      selected
                        ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-400 dark:border-brand-500/60 dark:bg-brand-500/15 dark:ring-brand-500/40'
                        : 'border-ink-200 hover:border-ink-300 hover:bg-ink-50 dark:border-white/10 dark:hover:border-white/20 dark:hover:bg-white/[0.04]'
                    } ${disabled ? 'cursor-not-allowed opacity-40' : ''}`}
                  >
                    <span className="text-sm font-semibold text-ink-900 dark:text-white">
                      {label}
                    </span>
                    <span className="text-[11px] leading-tight text-ink-500 dark:text-ink-400">
                      {hint}
                    </span>
                  </button>
                );
              })}
            </div>

            {method === 'member_account' && member !== null ? (
              <p className="rounded-card bg-brand-50 px-3 py-2 text-sm text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
                Charged to {member.name}&rsquo;s account.
              </p>
            ) : null}

            {method === 'cash' ? (
              <div className="flex flex-col gap-3 border-t border-ink-100 pt-3 dark:border-white/10">
                <label className="flex items-center justify-between gap-2 text-sm font-medium text-ink-700 dark:text-ink-200">
                  <span>Cash received</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    autoFocus
                    value={cashTendered > 0 ? minorToInput(cashTendered) : ''}
                    onChange={(event) => setCashTendered(inputToMinor(event.target.value) ?? 0)}
                    placeholder="0.00"
                    aria-label="Cash received"
                    className="w-32 rounded-field border border-ink-200 bg-white px-2 py-1 text-right text-base text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/20 dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
                  />
                </label>

                <div className="flex flex-wrap gap-2">
                  {quickTenders.map((amount) => (
                    <button
                      key={amount}
                      type="button"
                      onClick={() => setCashTendered(amount)}
                      className="rounded-btn border border-ink-200 px-3 py-1 text-sm text-ink-700 hover:border-brand-400 hover:bg-brand-50 dark:border-white/10 dark:text-ink-200 dark:hover:border-brand-500/60 dark:hover:bg-brand-500/10"
                    >
                      {amount === total ? 'Exact' : formatPrice(amount, currency)}
                    </button>
                  ))}
                </div>

                <div className="flex items-center justify-between text-base">
                  <span className="font-medium text-ink-600 dark:text-ink-300">
                    {cashShort ? 'Still owed' : 'Change due'}
                  </span>
                  <span
                    className={`font-mono font-bold tabular-nums ${cashShort ? 'text-danger-600 dark:text-danger-400' : 'text-ink-900 dark:text-white'}`}
                  >
                    {formatPrice(cashShort ? total - cashTendered : changeDue, currency)}
                  </span>
                </div>
              </div>
            ) : null}

            {saveError !== null ? (
              <Card
                role="alert"
                className="flex items-center gap-2 p-3 text-sm text-danger-700 dark:text-danger-300"
              >
                <Icon name="info" className="h-4 w-4 shrink-0" />
                <span>Couldn’t record the sale: {saveError}</span>
              </Card>
            ) : null}

            <div className="flex gap-2 pt-1">
              <Btn v="outline" size="md" onClick={onClose} className="flex-1">
                Cancel
              </Btn>
              <Btn
                v="primary"
                size="md"
                onClick={() => void complete()}
                disabled={!canComplete}
                className="flex-[2]"
              >
                {saving ? 'Recording…' : 'Complete sale'}
              </Btn>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** The post-completion confirmation: what was settled, plus change owed for cash. */
function PaymentSuccess({ sale, onFinish }: { sale: CompletedSale; onFinish: () => void }) {
  const methodLabel = METHODS.find((entry) => entry.method === sale.method)?.label ?? sale.method;

  return (
    <div className="flex flex-col gap-4 text-center">
      <div className="flex flex-col items-center gap-1">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success-100 text-success-600 dark:bg-success-500/15 dark:text-success-300">
          <Icon name="check" className="h-6 w-6" sw={2.5} />
        </div>
        <h2 className="font-display text-lg font-extrabold tracking-tight text-ink-900 dark:text-white">
          Sale complete
        </h2>
        <p className="text-sm text-ink-500 dark:text-ink-400">
          {sale.itemCount} item{sale.itemCount === 1 ? '' : 's'} · {methodLabel}
          {sale.memberName ? ` · ${sale.memberName}` : ''}
        </p>
      </div>

      <dl className="flex flex-col gap-2 rounded-card border border-ink-200 p-3 text-sm dark:border-white/10">
        <div className="flex items-center justify-between">
          <dt className="text-ink-500 dark:text-ink-400">Total paid</dt>
          <dd className="font-mono font-semibold tabular-nums text-ink-900 dark:text-white">
            {formatPrice(sale.total, sale.currency)}
          </dd>
        </div>
        {sale.method === 'cash' ? (
          <>
            <div className="flex items-center justify-between">
              <dt className="text-ink-500 dark:text-ink-400">Cash received</dt>
              <dd className="font-mono tabular-nums text-ink-900 dark:text-white">
                {formatPrice(sale.tendered, sale.currency)}
              </dd>
            </div>
            <div className="flex items-center justify-between text-base">
              <dt className="font-medium text-ink-600 dark:text-ink-300">Change due</dt>
              <dd className="font-mono font-bold tabular-nums text-ink-900 dark:text-white">
                {formatPrice(sale.change, sale.currency)}
              </dd>
            </div>
          </>
        ) : null}
      </dl>

      <ReceiptSender sale={sale} />

      <Btn v="primary" size="md" onClick={onFinish}>
        New sale
      </Btn>
    </div>
  );
}

/** What the receipt send is currently doing — drives the inline status copy. */
type SendStatus =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent' }
  | { kind: 'unconfigured' }
  | { kind: 'error'; message: string };

/**
 * The "Email receipt" control on the success screen: an address field (pre-filled
 * with the attached member's email) and a send button. Delegates to
 * {@link emailReceiptAction}; a `delivered:false` (email unconfigured server-side)
 * is reported as a soft note rather than an error, since the sale still completed.
 */
function ReceiptSender({ sale }: { sale: CompletedSale }) {
  const [email, setEmail] = useState(sale.memberEmail ?? '');
  const [status, setStatus] = useState<SendStatus>({ kind: 'idle' });

  const trimmed = email.trim();
  const canSend = trimmed !== '' && status.kind !== 'sending';

  async function send(): Promise<void> {
    if (!canSend) {
      return;
    }
    setStatus({ kind: 'sending' });
    const result = await emailReceiptAction({ email: trimmed, receipt: sale.receipt });
    if (!result.ok) {
      setStatus({ kind: 'error', message: result.error });
      return;
    }
    setStatus(result.data.delivered ? { kind: 'sent' } : { kind: 'unconfigured' });
  }

  return (
    <div className="flex flex-col gap-2 border-t border-ink-100 pt-3 text-left dark:border-white/10">
      <span className="text-sm font-medium text-ink-700 dark:text-ink-200">Email receipt</span>
      <div className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            if (status.kind !== 'idle' && status.kind !== 'sending') {
              setStatus({ kind: 'idle' });
            }
          }}
          placeholder="customer@example.com"
          aria-label="Receipt email address"
          className="h-11 flex-1 rounded-field border border-ink-200 bg-white px-3.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/20 dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
        />
        <Btn v="outline" size="md" onClick={() => void send()} disabled={!canSend}>
          {status.kind === 'sending' ? 'Sending…' : 'Send'}
        </Btn>
      </div>
      {status.kind === 'sent' ? (
        <p className="text-xs text-success-700 dark:text-success-300">Receipt sent to {trimmed}.</p>
      ) : null}
      {status.kind === 'unconfigured' ? (
        <p className="text-xs text-ink-500 dark:text-ink-400">
          Email delivery isn&rsquo;t configured — receipt not sent.
        </p>
      ) : null}
      {status.kind === 'error' ? (
        <p className="text-xs text-danger-600 dark:text-danger-400">{status.message}</p>
      ) : null}
    </div>
  );
}
