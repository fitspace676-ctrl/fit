'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import * as stylex from '@stylexjs/stylex';
import { Badge, Btn, Icon, Modal, useToast } from '@/components/ui';
import { adjustVariantStockAction } from '../actions';

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
});

interface StockAdjusterProps {
  productId: string;
  productName: string;
  variantIndex: number;
  variantName: string;
  sku: string;
  /** The variant's live on-hand count — the adjustment's starting point. */
  stock: number;
}

/**
 * The stock-adjustment entry point (T4.7), rebuilt on brand-tokened StyleX (T11.22).
 * A per-variant "Adjust" button on the low-stock report that opens a modal to set
 * the variant's new on-hand count: a −/+ stepper, quick "+N" restock presets, a
 * direct number field and a "→ N units" target preview. Applying reuses the
 * existing product-update backend through {@link adjustVariantStockAction} (no
 * dedicated stock endpoint), then refreshes the report so the row reflects the new
 * count — or drops off it once the variant clears the threshold.
 *
 * Rendered only for staff holding `ProductWrite` (the page gates on the session);
 * the action re-checks the capability regardless.
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
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  const delta = target - stock;
  const unchanged = delta === 0;

  function reset() {
    setTarget(stock);
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
      const result = await adjustVariantStockAction(productId, variantIndex, target);
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
