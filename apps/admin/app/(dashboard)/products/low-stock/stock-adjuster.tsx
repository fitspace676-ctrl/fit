'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Btn, Icon, Input, Modal, useToast } from '@/components/ui';
import { adjustVariantStockAction } from '../actions';

/** The most a single quick step nudges the on-hand target — a small restock cushion. */
const STEP = 1;

/** Quick-restock presets the adjuster offers beside the stepper (add to the current count). */
const QUICK_ADDS = [5, 10, 25] as const;

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
 * The stock-adjustment entry point (T4.7). A per-variant "Adjust" button on the
 * low-stock report that opens a modal to set the variant's new on-hand count:
 * a −/+ stepper, quick "+N" restock presets, a direct number field and a
 * "→ N units" target preview. Applying reuses the existing product-update backend
 * through {@link adjustVariantStockAction} (no dedicated stock endpoint), then
 * refreshes the report so the row reflects the new count — or drops off it once the
 * variant clears the threshold.
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
            {productName} · <span className="text-ink-600 dark:text-ink-300">{variantName}</span>
            {sku ? <span className="font-mono text-ink-400"> · {sku}</span> : null}
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
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-ink-500 dark:text-ink-400">On hand now</span>
            <Badge tone={stock === 0 ? 'danger' : 'warning'}>
              {stock === 0 ? 'Out of stock' : `${stock} left`}
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            <Btn
              v="outline"
              size="icon"
              icon="minus"
              aria-label="Decrease"
              disabled={target <= 0 || saving}
              onClick={() => setTarget((value) => clamp(value - STEP))}
            />
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={target}
              disabled={saving}
              aria-label="New on-hand count"
              className="text-center font-mono tabular-nums"
              onChange={(event) => setTarget(clamp(event.target.valueAsNumber))}
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

          <div className="flex flex-wrap gap-2">
            {QUICK_ADDS.map((add) => (
              <button
                key={add}
                type="button"
                disabled={saving}
                onClick={() => setTarget((value) => clamp(value + add))}
                className="rounded-pill px-2.5 py-1 text-[11px] font-semibold text-ink-600 ring-1 ring-inset ring-ink-200 transition hover:bg-ink-50 disabled:opacity-40 dark:text-ink-300 dark:ring-white/10 dark:hover:bg-white/[0.04]"
              >
                +{add}
              </button>
            ))}
          </div>

          <p className="flex items-center gap-2 text-sm text-ink-500 dark:text-ink-400">
            <Icon name="arrow" className="h-4 w-4 shrink-0" sw={2} />
            <span>
              <span className="font-mono font-bold tabular-nums text-ink-900 dark:text-white">
                {target}
              </span>{' '}
              units
              {unchanged ? null : (
                <span
                  className={`ml-2 font-mono tabular-nums ${
                    delta > 0
                      ? 'text-success-600 dark:text-success-300'
                      : 'text-danger-600 dark:text-danger-300'
                  }`}
                >
                  ({delta > 0 ? '+' : ''}
                  {delta})
                </span>
              )}
            </span>
          </p>

          {error !== null ? (
            <p
              role="alert"
              className="flex items-center gap-2 text-sm text-danger-700 dark:text-danger-300"
            >
              <Icon name="info" className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </p>
          ) : null}
        </div>
      </Modal>
    </>
  );
}
