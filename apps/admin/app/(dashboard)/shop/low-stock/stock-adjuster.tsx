'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import * as stylex from '@stylexjs/stylex';
import { MANUAL_STOCK_REASONS, type ManualStockReason } from '@fit/types';
import { Badge, Btn, Icon, Modal, useToast } from '@/components/ui';
import { adjustStockAction } from '../actions';

/**
 * What each reason means on the shelf. The wording is the staffer's, not the
 * schema's: they are recording an event that happened, and the label should match
 * how they would describe it out loud.
 */
const REASON_LABELS: Record<ManualStockReason, string> = {
  RECEIVE: 'Delivery',
  ADJUSTMENT: 'Correction',
  RECOUNT: 'Recount',
  WRITE_OFF: 'Write-off',
};

/** The most a single quick step nudges the on-hand target — a small restock cushion. */
const STEP = 1;

/** Quick-restock presets the adjuster offers beside the stepper (add to the current count). */
const QUICK_ADDS = [5, 10, 25] as const;

const styles = stylex.create({
  descVariant: {
    color: 'var(--color-text-primary)',
  },
  descSku: {
    fontFamily: 'var(--font-family-code)',
    color: 'var(--color-text-secondary)',
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  onHandRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: '0.875rem',
  },
  onHandLabel: {
    color: 'var(--color-text-secondary)',
  },
  stepperRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  countInput: {
    height: '2.75rem',
    width: '100%',
    minWidth: 0,
    flexGrow: 1,
    flexBasis: 0,
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: {
      default: 'var(--color-border)',
      ':focus': 'var(--color-accent)',
    },
    backgroundColor: {
      default: 'var(--color-background-surface)',
      ':disabled': 'var(--color-background-muted)',
    },
    paddingInline: '0.875rem',
    textAlign: 'center',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.875rem',
    fontVariantNumeric: 'tabular-nums',
    color: {
      default: 'var(--color-text-primary)',
      ':disabled': 'var(--color-text-secondary)',
    },
    outline: 'none',
  },
  quickRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem',
  },
  quickAdd: {
    borderRadius: 'var(--radius-full)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--color-background-muted)',
    },
    paddingInline: '0.625rem',
    paddingBlock: '0.25rem',
    fontSize: '0.6875rem',
    fontWeight: 600,
    cursor: 'pointer',
    color: 'var(--color-text-secondary)',
    opacity: {
      default: 1,
      ':disabled': 0.4,
    },
  },
  preview: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  previewIcon: {
    width: '1rem',
    height: '1rem',
    flexShrink: 0,
  },
  previewTarget: {
    fontFamily: 'var(--font-family-code)',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  delta: {
    marginLeft: '0.5rem',
    fontFamily: 'var(--font-family-code)',
    fontVariantNumeric: 'tabular-nums',
  },
  deltaUp: {
    color: 'var(--color-success)',
  },
  deltaDown: {
    color: 'var(--color-error)',
  },
  error: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-error)',
  },
  errorIcon: {
    width: '1rem',
    height: '1rem',
    flexShrink: 0,
  },
  fieldLabel: {
    fontSize: '0.75rem',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
  },
  reasonRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.375rem',
  },
  reasonChip: {
    paddingInline: '0.75rem',
    paddingBlock: '0.375rem',
    borderRadius: 'var(--radius-full)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--color-overlay-hover)',
    },
    color: 'var(--color-text-secondary)',
    fontSize: '0.8125rem',
    fontFamily: 'var(--font-family-body)',
    cursor: 'pointer',
  },
  reasonChipOn: {
    borderColor: 'var(--color-accent)',
    backgroundColor: 'var(--color-accent-muted)',
    color: 'var(--color-text-accent)',
    fontWeight: 600,
  },
  noteInput: {
    height: '2.5rem',
    width: '100%',
    boxSizing: 'border-box',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: {
      default: 'var(--color-border)',
      ':focus': 'var(--color-accent)',
    },
    backgroundColor: 'var(--color-background-surface)',
    paddingInline: '0.75rem',
    color: 'var(--color-text-primary)',
    fontFamily: 'var(--font-family-body)',
    fontSize: '0.875rem',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.375rem',
  },
});

interface StockAdjusterProps {
  productId: string;
  productName: string;
  /** The position to move: a variant slot, or `null` for a product sold as-is. */
  variantIndex: number | null;
  variantName: string;
  sku: string;
  /** The position's live on-hand count — the adjustment's starting point. */
  stock: number;
}

/**
 * The stock-adjustment entry point (T4.7), rebuilt on brand-tokened StyleX (T11.22).
 * An "Adjust" button that opens a modal to set a position's new on-hand count: a
 * −/+ stepper, quick "+N" restock presets, a direct number field, a reason, and a
 * "→ N units" preview.
 *
 * The staffer works in absolute terms — the number they can see on the shelf — so
 * the count is submitted as `setTo` and the server derives the movement's delta
 * against the live figure. That way a colleague's restock landing mid-edit is not
 * silently undone by this one.
 *
 * Every adjustment carries a reason, and optionally a note, because the point of
 * the ledger is answering "why is this 3?" months later. Rendered only for staff
 * holding `ProductWrite` (the page gates on the session); the action re-checks the
 * capability regardless.
 */
export function StockAdjuster({
  productId,
  productName,
  variantIndex,
  variantName,
  sku,
  stock,
}: StockAdjusterProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(stock);
  const [reason, setReason] = useState<ManualStockReason>('RECEIVE');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  const delta = target - stock;
  const unchanged = delta === 0;

  function reset() {
    setTarget(stock);
    setReason('RECEIVE');
    setNote('');
    setError(null);
  }

  function close() {
    if (saving) return;
    setOpen(false);
  }

  function clamp(next: number): number {
    if (!Number.isFinite(next)) return 0;
    return Math.max(0, Math.trunc(next));
  }

  function apply() {
    if (unchanged) return;
    setError(null);
    startSave(async () => {
      const result = await adjustStockAction(productId, {
        variantIndex,
        setTo: target,
        reason,
        note,
      });
      if (result.ok) {
        toast(`${variantName} stock set to ${result.data.stock}`, {
          tone: 'success',
          icon: 'check',
        });
        setOpen(false);
        router.refresh();
      } else {
        setError(result.error);
        toast(result.error, { tone: 'danger', icon: 'info' });
      }
    });
  }

  return (
    <>
      <Btn
        v="outline"
        size="sm"
        icon="settings"
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        Adjust
      </Btn>

      <Modal
        open={open}
        onClose={close}
        title="Adjust stock"
        description={
          <>
            {productName} · <span {...stylex.props(styles.descVariant)}>{variantName}</span>
            {sku ? <span {...stylex.props(styles.descSku)}> · {sku}</span> : null}
          </>
        }
        size="sm"
        footer={
          <>
            <Btn v="ghost" size="sm" onClick={close} disabled={saving}>
              Cancel
            </Btn>
            <Btn v="primary" size="sm" icon="check" onClick={apply} disabled={unchanged || saving}>
              {saving ? 'Saving…' : 'Apply adjustment'}
            </Btn>
          </>
        }
      >
        <div {...stylex.props(styles.body)}>
          <div {...stylex.props(styles.onHandRow)}>
            <span {...stylex.props(styles.onHandLabel)}>On hand now</span>
            <Badge tone={stock === 0 ? 'danger' : 'warning'}>
              {stock === 0 ? 'Out of stock' : `${stock} left`}
            </Badge>
          </div>

          <div {...stylex.props(styles.stepperRow)}>
            <Btn
              v="outline"
              size="icon"
              icon="minus"
              aria-label="Decrease"
              disabled={target <= 0 || saving}
              onClick={() => setTarget((value) => clamp(value - STEP))}
            />
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={target}
              disabled={saving}
              aria-label="New on-hand count"
              onChange={(event) => setTarget(clamp(event.target.valueAsNumber))}
              {...stylex.props(styles.countInput)}
            />
            <Btn
              v="outline"
              size="icon"
              icon="plus"
              aria-label="Increase"
              disabled={saving}
              onClick={() => setTarget((value) => clamp(value + STEP))}
            />
          </div>

          <div {...stylex.props(styles.quickRow)}>
            {QUICK_ADDS.map((add) => (
              <button
                key={add}
                type="button"
                disabled={saving}
                onClick={() => setTarget((value) => clamp(value + add))}
                {...stylex.props(styles.quickAdd)}
              >
                +{add}
              </button>
            ))}
          </div>

          <div {...stylex.props(styles.field)}>
            <span {...stylex.props(styles.fieldLabel)}>Reason</span>
            <div {...stylex.props(styles.reasonRow)} role="group" aria-label="Reason">
              {MANUAL_STOCK_REASONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={reason === option}
                  disabled={saving}
                  onClick={() => setReason(option)}
                  {...stylex.props(styles.reasonChip, reason === option && styles.reasonChipOn)}
                >
                  {REASON_LABELS[option]}
                </button>
              ))}
            </div>
          </div>

          <div {...stylex.props(styles.field)}>
            <label htmlFor="stock-note" {...stylex.props(styles.fieldLabel)}>
              Note (optional)
            </label>
            <input
              id="stock-note"
              type="text"
              value={note}
              disabled={saving}
              maxLength={280}
              placeholder="Supplier, damage, count sheet…"
              onChange={(event) => setNote(event.target.value)}
              {...stylex.props(styles.noteInput)}
            />
          </div>

          <p {...stylex.props(styles.preview)}>
            <Icon name="arrow" sw={2} {...stylex.props(styles.previewIcon)} />
            <span>
              <span {...stylex.props(styles.previewTarget)}>{target}</span> units
              {unchanged ? null : (
                <span
                  {...stylex.props(styles.delta, delta > 0 ? styles.deltaUp : styles.deltaDown)}
                >
                  ({delta > 0 ? '+' : ''}
                  {delta})
                </span>
              )}
            </span>
          </p>

          {error !== null ? (
            <p role="alert" {...stylex.props(styles.error)}>
              <Icon name="info" {...stylex.props(styles.errorIcon)} />
              <span>{error}</span>
            </p>
          ) : null}
        </div>
      </Modal>
    </>
  );
}
