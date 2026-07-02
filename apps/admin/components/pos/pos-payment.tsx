'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { PaymentMethod, PosReceipt } from '@fit/types';
import { formatPrice, inputToMinor, minorToInput } from '@/app/(dashboard)/products/format-price';
import {
  emailReceiptAction,
  recordPosSaleAction,
  type PosMemberRow,
} from '@/app/(dashboard)/pos/actions';
import { Btn, Icon } from '@/components/ui';
import {
  lineTotal,
  selectChangeDue,
  selectDiscountTotal,
  selectItemCount,
  selectSubtotal,
  selectTotal,
  usePosCart,
} from '@/stores/pos-cart-store';
import { PosIcon } from './pos-icons';

/** A finished sale, snapshotted at completion so the receipt survives the cart reset. */
interface CompletedSale {
  method: PaymentMethod;
  total: number;
  tendered: number;
  change: number;
  currency: string;
  memberName: string | null;
  /** The member's address, pre-filled into the receipt field (`null` for a walk-in). */
  memberEmail: string | null;
  /** The persisted order's id (T7.5) — referenced on the receipt preview. */
  orderId: string;
  /** When the sale settled — stamped onto the receipt preview's header. */
  completedAt: Date;
  /** The validated sale snapshot the receipt email is rendered from. */
  receipt: PosReceipt;
}

/** The three settlement methods, with the copy the tiles render. */
const METHODS: ReadonlyArray<{ method: PaymentMethod; label: string }> = [
  { method: 'cash', label: 'Cash' },
  { method: 'card', label: 'Card' },
  { method: 'member_account', label: 'Member' },
];

/** The tile glyph per settlement method (the wallet/cash glyphs are POS-local). */
function methodIcon(method: PaymentMethod, className: string): ReactNode {
  switch (method) {
    case 'cash':
      return <PosIcon name="cash" className={className} sw={2} />;
    case 'card':
      return <Icon name="card" className={className} sw={2} />;
    case 'member_account':
      return <PosIcon name="wallet" className={className} sw={2} />;
  }
}

/** Round-up suggestions offered as quick-tender chips, in minor units (5 / 10 / 20 / 50). */
const QUICK_TENDER_STEPS = [500, 1000, 2000, 5000];

/** The currency's symbol (e.g. `$`), for the tender field's prefix. */
function currencySymbol(currency: string): string {
  try {
    const part = new Intl.NumberFormat(undefined, { style: 'currency', currency })
      .formatToParts(0)
      .find((entry) => entry.type === 'currency');
    return part?.value ?? currency;
  } catch {
    return currency;
  }
}

/** The uppercase micro-label used across the modal (Amount due / Tender amount …). */
const MICRO_LABEL =
  'text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-500 dark:text-ink-400';

/**
 * The POS payment modal (T7.3). Opens from the cart's "Charge" button and walks
 * the operator through settling the sale: pick cash / card / member account
 * (cash preselected), and for cash enter the tender amount to see the remaining /
 * change figure live in the header panel. "Member" is only selectable when a
 * member is attached (a walk-in has no account to charge). Completing the sale
 * snapshots a {@link CompletedSale} for the receipt preview, then `onCompleted`
 * lets the board reset the cart.
 *
 * The receipt preview offers to email the customer a receipt (T7.4) — the
 * snapshot is sent to `POST /orders/receipt`, which renders + delivers it. The
 * sale itself is persisted first via `POST /orders/pos-sale` (T7.5), whose order
 * id the preview references.
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

  // Cash is the terminal's default tender — preselect it on open (the design's
  // modal never shows a method-less state).
  useEffect(() => {
    if (method === null) {
      setPaymentMethod('cash');
    }
  }, [method, setPaymentMethod]);

  const cashShort = method === 'cash' && cashTendered < total;
  // Card / member-account settle exactly; only a cash tender can run short or over.
  const remaining =
    method === 'card' || method === 'member_account' ? 0 : Math.max(0, total - cashTendered);
  const canComplete =
    total > 0 &&
    method !== null &&
    !cashShort &&
    !(method === 'member_account' && member === null) &&
    !saving;

  const quickTenders = useMemo(() => {
    const suggestions = new Set<number>();
    for (const step of QUICK_TENDER_STEPS) {
      suggestions.add(Math.ceil(total / step) * step);
    }
    suggestions.delete(total);
    return [...suggestions].filter((amount) => amount > total).sort((a, b) => a - b);
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
      memberName: member?.name ?? null,
      memberEmail: member?.email ?? null,
      orderId: result.data.orderId,
      completedAt: new Date(),
      receipt,
    });
  }

  function finish(): void {
    onCompleted();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center p-4"
      role="presentation"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-ink-950/70 backdrop-blur-sm" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Payment"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="relative w-full max-w-lg overflow-hidden rounded-card bg-white ring-1 ring-inset ring-ink-200 shadow-[0_40px_100px_-20px_rgba(0,0,0,0.7)] focus:outline-none dark:bg-ink-900 dark:ring-white/10"
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 hidden h-px bg-gradient-to-r from-transparent via-white/30 to-transparent dark:block"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -top-20 left-1/3 h-40 w-48 bg-brand-500/20 blur-3xl"
        />

        {completed ? (
          <PaymentSuccess sale={completed} onFinish={finish} />
        ) : (
          <>
            <div className="relative px-6 pb-5 pt-6">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-display text-xl font-extrabold tracking-tight text-ink-900 dark:text-white">
                    Payment
                  </h2>
                  <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
                    {member?.name ?? 'Walk-in'} · {itemCount} item{itemCount === 1 ? '' : 's'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="grid h-9 w-9 place-items-center rounded-btn text-ink-500 transition hover:bg-ink-100 hover:text-ink-900 dark:text-ink-400 dark:hover:bg-white/10 dark:hover:text-white"
                >
                  <Icon name="x" className="h-5 w-5" sw={2.2} />
                </button>
              </div>

              {/* Due / remaining */}
              <div className="mt-4 flex items-end justify-between rounded-card bg-ink-50 p-4 ring-1 ring-inset ring-ink-200 dark:bg-white/[0.03] dark:ring-white/10">
                <div>
                  <p className={MICRO_LABEL}>Amount due</p>
                  <p className="mt-1 font-display text-3xl font-extrabold tabular-nums text-ink-900 dark:text-white">
                    {formatPrice(total, currency)}
                  </p>
                </div>
                <div className="text-right">
                  <p className={MICRO_LABEL}>{changeDue > 0 ? 'Change' : 'Remaining'}</p>
                  <p
                    className={`mt-1 font-display text-3xl font-extrabold tabular-nums ${
                      changeDue > 0 || remaining === 0
                        ? 'text-success-600 dark:text-success-300'
                        : 'text-warning-600 dark:text-warning-300'
                    }`}
                  >
                    {formatPrice(changeDue > 0 ? changeDue : remaining, currency)}
                  </p>
                </div>
              </div>

              {/* Method tiles */}
              <div className="mt-4 grid grid-cols-3 gap-2.5">
                {METHODS.map(({ method: value, label }) => {
                  const disabled = value === 'member_account' && member === null;
                  const selected = method === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      disabled={disabled}
                      aria-pressed={selected}
                      onClick={() => setPaymentMethod(value)}
                      className={`flex flex-col items-center gap-1.5 rounded-card py-3 ring-1 ring-inset transition disabled:cursor-not-allowed disabled:opacity-40 ${
                        selected
                          ? 'bg-[linear-gradient(135deg,#7C3AED,#EC4899)] text-white ring-brand-400/40 shadow-[0_8px_24px_-8px_rgba(124,58,237,0.8)]'
                          : 'bg-white text-ink-700 ring-ink-200 hover:bg-ink-50 dark:bg-white/[0.04] dark:text-ink-200 dark:ring-white/10 dark:hover:bg-white/[0.07]'
                      }`}
                    >
                      {methodIcon(value, 'h-5 w-5')}
                      <span className="text-xs font-semibold">{label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Tender amount + quick cash (cash only — card / member settle exactly) */}
              {method === 'cash' ? (
                <div className="mt-4">
                  <label htmlFor="pos-tender" className={`mb-1.5 block ${MICRO_LABEL}`}>
                    Tender amount
                  </label>
                  <div className="flex h-12 items-center rounded-field bg-ink-50 px-3.5 ring-1 ring-inset ring-ink-200 transition focus-within:ring-2 focus-within:ring-brand-500 dark:bg-white/[0.04] dark:ring-white/10">
                    <span className="mr-1.5 font-mono text-sm text-ink-500 dark:text-ink-400">
                      {currencySymbol(currency)}
                    </span>
                    <input
                      id="pos-tender"
                      type="number"
                      min={0}
                      step="0.01"
                      autoFocus
                      inputMode="decimal"
                      value={cashTendered > 0 ? minorToInput(cashTendered) : ''}
                      onChange={(event) => setCashTendered(inputToMinor(event.target.value) ?? 0)}
                      placeholder="0.00"
                      aria-label="Tender amount"
                      className="flex-1 bg-transparent font-mono text-lg font-bold tabular-nums text-ink-900 outline-none placeholder:text-ink-400 dark:text-white dark:placeholder:text-ink-500"
                    />
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    {quickTenders.map((amount) => (
                      <button
                        key={amount}
                        type="button"
                        onClick={() => setCashTendered(amount)}
                        className="h-8 rounded-pill bg-white px-3 font-mono text-xs font-semibold text-ink-700 ring-1 ring-inset ring-ink-200 transition hover:bg-ink-50 dark:bg-white/[0.04] dark:text-ink-200 dark:ring-white/10 dark:hover:bg-white/[0.08]"
                      >
                        {formatPrice(amount, currency)}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setCashTendered(total)}
                      className="h-8 rounded-pill bg-brand-500/10 px-3 text-xs font-semibold text-brand-700 ring-1 ring-inset ring-brand-500/30 transition dark:bg-brand-500/15 dark:text-brand-200 dark:ring-brand-400/30"
                    >
                      Exact
                    </button>
                  </div>
                </div>
              ) : null}

              {saveError !== null ? (
                <p role="alert" className="mt-4 text-sm text-danger-600 dark:text-danger-400">
                  Couldn’t record the sale: {saveError}
                </p>
              ) : null}
            </div>

            <div className="relative flex items-center gap-3 border-t border-ink-200 bg-ink-50 px-6 py-4 dark:border-white/10 dark:bg-white/[0.02]">
              {remaining > 0 ? (
                <span className="text-sm font-semibold text-warning-700 dark:text-warning-300">
                  Underpaid by {formatPrice(remaining, currency)}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-success-700 dark:text-success-300">
                  <Icon name="check" className="h-4 w-4" sw={2.4} />
                  Ready to complete
                </span>
              )}
              <Btn
                v="primary"
                size="md"
                icon="check"
                onClick={() => void complete()}
                disabled={!canComplete}
                className="ml-auto"
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

/** The post-completion receipt preview: what settled, itemised, plus the email send. */
function PaymentSuccess({ sale, onFinish }: { sale: CompletedSale; onFinish: () => void }) {
  const methodLabel = METHODS.find((entry) => entry.method === sale.method)?.label ?? sale.method;
  const time = sale.completedAt.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="relative">
      <div className="px-6 pb-5 pt-7 text-center">
        <span className="relative mx-auto inline-grid h-14 w-14 place-items-center">
          <span aria-hidden className="absolute inset-0 rounded-full bg-success-500/30 blur-xl" />
          <span className="relative grid h-14 w-14 place-items-center rounded-full bg-gradient-to-b from-success-400 to-success-600 shadow-[0_8px_28px_-6px_rgba(18,183,106,0.8)]">
            <Icon name="check" className="h-7 w-7 text-white" sw={2.6} />
          </span>
        </span>
        <h2 className="mt-3 font-display text-xl font-extrabold tracking-tight text-ink-900 dark:text-white">
          Payment complete
        </h2>
        <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
          Order #{sale.orderId.slice(-6).toUpperCase()} · {sale.memberName ?? 'Walk-in'}
        </p>
      </div>

      {/* Receipt preview */}
      <div className="mx-6 mb-5 overflow-hidden rounded-card bg-ink-50 ring-1 ring-inset ring-ink-200 dark:bg-white/[0.03] dark:ring-white/10">
        <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3 dark:border-white/10">
          <span className="font-display text-sm font-bold tracking-tight text-ink-900 dark:text-white">
            In-store sale
          </span>
          <span className="font-mono text-[11px] text-ink-500 dark:text-ink-400">{time}</span>
        </div>
        <div className="space-y-1.5 p-4">
          {sale.receipt.items.map((item, index) => (
            <div key={index} className="flex items-center justify-between text-sm">
              <span className="text-ink-900 dark:text-white">
                <span className="font-mono text-ink-500 dark:text-ink-400">{item.quantity}×</span>{' '}
                {item.name}
              </span>
              <span className="font-mono tabular-nums text-ink-900 dark:text-white">
                {formatPrice(item.amount, sale.currency)}
              </span>
            </div>
          ))}
          <div className="mt-1 space-y-1.5 border-t border-ink-200 pt-2 dark:border-white/10">
            {sale.receipt.discountTotal > 0 ? (
              <div className="flex justify-between text-sm text-success-700 dark:text-success-300">
                <span>Discount</span>
                <span className="font-mono tabular-nums">
                  −{formatPrice(sale.receipt.discountTotal, sale.currency)}
                </span>
              </div>
            ) : null}
            <div className="flex justify-between">
              <span className="font-semibold text-ink-900 dark:text-white">Total</span>
              <span className="font-mono font-bold tabular-nums text-ink-900 dark:text-white">
                {formatPrice(sale.total, sale.currency)}
              </span>
            </div>
            <div className="flex justify-between text-sm text-ink-500 dark:text-ink-400">
              <span>{methodLabel}</span>
              <span className="font-mono tabular-nums">
                {formatPrice(sale.tendered, sale.currency)}
              </span>
            </div>
            {sale.change > 0 ? (
              <div className="flex justify-between text-sm">
                <span className="text-ink-500 dark:text-ink-400">Change</span>
                <span className="font-mono tabular-nums text-ink-900 dark:text-white">
                  {formatPrice(sale.change, sale.currency)}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <ReceiptSender sale={sale} />

      <div className="flex items-center gap-2.5 border-t border-ink-200 bg-ink-50 px-6 py-4 dark:border-white/10 dark:bg-white/[0.02]">
        <Btn v="primary" size="md" icon="plus" onClick={onFinish} className="ml-auto">
          New sale
        </Btn>
      </div>
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
 * The "Email receipt" control on the receipt preview: an address field (pre-filled
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
    <div className="px-6 pb-5 text-left">
      <label htmlFor="pos-receipt-email" className={`mb-1.5 block ${MICRO_LABEL}`}>
        Email receipt
      </label>
      <div className="flex items-center gap-2.5">
        <input
          id="pos-receipt-email"
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
          className="h-11 flex-1 rounded-field bg-ink-50 px-3.5 text-sm text-ink-900 outline-none ring-1 ring-inset ring-ink-200 transition placeholder:text-ink-400 focus:ring-2 focus:ring-brand-500 dark:bg-white/[0.04] dark:text-white dark:ring-white/10 dark:placeholder:text-ink-500"
        />
        <Btn v="outline" size="md" onClick={() => void send()} disabled={!canSend}>
          <PosIcon name="mail" className="h-4 w-4" sw={2.1} />
          {status.kind === 'sending' ? 'Sending…' : 'Email'}
        </Btn>
      </div>
      {status.kind === 'sent' ? (
        <p className="mt-1.5 text-xs text-success-700 dark:text-success-300">
          Receipt sent to {trimmed}.
        </p>
      ) : null}
      {status.kind === 'unconfigured' ? (
        <p className="mt-1.5 text-xs text-ink-500 dark:text-ink-400">
          Email delivery isn&rsquo;t configured — receipt not sent.
        </p>
      ) : null}
      {status.kind === 'error' ? (
        <p className="mt-1.5 text-xs text-danger-600 dark:text-danger-400">{status.message}</p>
      ) : null}
    </div>
  );
}
