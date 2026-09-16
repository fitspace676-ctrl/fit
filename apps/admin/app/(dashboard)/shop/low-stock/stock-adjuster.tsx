'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import * as stylex from '@stylexjs/stylex';
import { MANUAL_STOCK_REASONS, type ManualStockReason } from '@fit/types';
import { Badge, Button, Dialog, SelectField } from '@fit/ui-kit';
import { Icon, useToast } from '@/components/ui';
import { useActiveLocation } from '@/components/active-location';
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
  /** Icon size inside a kit `Button`. */
  kitGlyph: { height: '1rem', width: '1rem' },
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
    color: 'var(--color-text-accent)',
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
  /** The branch a fixed-branch adjuster states rather than offers. */
  branchFixed: {
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  hint: {
    margin: 0,
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
});

interface StockAdjusterProps {
  productId: string;
  productName: string;
  /** The position to move: a variant slot, or `null` for a product sold as-is. */
  variantIndex: number | null;
  variantName: string;
  sku: string;
  /**
   * The on-hand figure the caller is showing for this position, or `null` when
   * nothing is recorded for it. What it *means* is settled by
   * {@link StockAdjusterProps.stockLocationId}, not by this number.
   */
  stock: number | null;
  /**
   * The branch {@link StockAdjusterProps.stock} is the count for, or `null` when
   * it is the gym-wide roll-up — a figure held on no single shelf.
   *
   * **This is what picks the adjuster's mode**, and the distinction is the whole
   * reason the prop exists. Since Stage 4 a count belongs to a branch, so
   * "I counted the shelf: eleven" is only a true statement when the eleven on
   * screen came from the shelf being written to. When it did (`stockLocationId`
   * names the branch), the form works in absolute terms and posts `setTo`, which
   * is what makes a recount safe against a colleague restocking mid-edit. When it
   * did not — the catalogue's gym-wide total, or an all-branches inventory row —
   * the form works in signed deltas instead, because setting a branch's shelf to
   * a number that came from four branches added together is precisely the
   * untargeted write Stage 4 exists to eliminate.
   */
  stockLocationId: string | null;
}

/**
 * The stock-adjustment entry point (T4.7), rebuilt on brand-tokened StyleX (T11.22),
 * per-branch since Stage 4 of multi-branch. An "Adjust" button that opens a modal
 * to move one position at one branch: a −/+ stepper, quick "+N" restock presets, a
 * direct number field, a reason, and a preview of where the count lands.
 *
 * **Every adjustment names a branch** — `adjustStockSchema.locationId` is required,
 * the one place in multi-branch the branch is not optional-with-a-default. The
 * branch comes from one of two places: the caller's own scope when it is showing a
 * single branch's counts (in which case it is stated, not offered — you do not
 * correct the satellite's shelf from the flagship's stocktake), or the console's
 * active branch when the caller's figure is gym-wide. In "All locations" mode
 * there is no active branch to inherit, so the operator picks one and Apply stays
 * disabled until they do; the API would reject the write anyway, and a disabled
 * button explains itself better than a `400`.
 *
 * See {@link StockAdjusterProps.stockLocationId} for why the form switches between
 * an absolute count and a signed delta.
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
  stockLocationId,
}: StockAdjusterProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { locationId: activeLocationId, locations } = useActiveLocation();

  // The count on screen is a real shelf's count only when the caller says which
  // shelf it came from. That is also the only case where the branch is not the
  // operator's to choose — the surface is already scoped to it.
  const absolute = stockLocationId !== null;
  const baseline = stock ?? 0;

  const [chosenBranch, setChosenBranch] = useState<string>(
    () => activeLocationId ?? (locations.length === 1 ? locations[0]!.id : ''),
  );
  const branch = stockLocationId ?? chosenBranch;
  const branchName = locations.find((location) => location.id === branch)?.name ?? branch;

  const [open, setOpen] = useState(false);
  /** Absolute mode: the new on-hand count. Delta mode: the signed change. */
  const [amount, setAmount] = useState(() => (absolute ? baseline : 0));
  const [reason, setReason] = useState<ManualStockReason>('RECEIVE');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  const delta = absolute ? amount - baseline : amount;
  const unchanged = delta === 0;
  const branchMissing = branch === '';

  function reset() {
    setAmount(absolute ? baseline : 0);
    setChosenBranch(activeLocationId ?? (locations.length === 1 ? locations[0]!.id : ''));
    setReason('RECEIVE');
    setNote('');
    setError(null);
  }

  function close() {
    if (saving) return;
    setOpen(false);
  }

  /** Absolute counts cannot go below zero; a delta may be negative (a write-off). */
  function clamp(next: number): number {
    if (!Number.isFinite(next)) return 0;
    const whole = Math.trunc(next);
    return absolute ? Math.max(0, whole) : whole;
  }

  function apply() {
    if (unchanged || branchMissing) return;
    setError(null);
    startSave(async () => {
      const result = await adjustStockAction(productId, {
        locationId: branch,
        variantIndex,
        ...(absolute ? { setTo: amount } : { delta }),
        reason,
        note,
      });
      if (result.ok) {
        toast(`${variantName} at ${branchName} set to ${result.data.stock}`, {
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
      <Button
        variant="secondary"
        size="inline"
        onClick={() => {
          reset();
          setOpen(true);
        }}
        icon={<Icon name="settings" {...stylex.props(styles.kitGlyph)} />}
        label="Adjust"
      />

      <Dialog
        open={open}
        onClose={close}
        title="Adjust stock"
        description={
          <>
            {productName} · <span {...stylex.props(styles.descVariant)}>{variantName}</span>
            {sku ? <span {...stylex.props(styles.descSku)}> · {sku}</span> : null}
          </>
        }
        actions={
          <>
            <Button
              variant="ghost"
              size="inline"
              onClick={close}
              disabled={saving}
              label="Cancel"
            />
            <Button
              variant="primary"
              size="inline"
              onClick={apply}
              disabled={unchanged || branchMissing || saving}
              icon={<Icon name="check" {...stylex.props(styles.kitGlyph)} />}
              label={saving ? 'Saving…' : 'Apply adjustment'}
            />
          </>
        }
      >
        <div {...stylex.props(styles.body)}>
          {/* The branch is stated when the surface already owns it, and chosen
              otherwise. It is never absent: the API requires it. */}
          <div {...stylex.props(styles.field)}>
            <span {...stylex.props(styles.fieldLabel)}>Branch</span>
            {absolute ? (
              <span {...stylex.props(styles.branchFixed)}>{branchName}</span>
            ) : locations.length === 0 ? (
              <p role="alert" {...stylex.props(styles.error)}>
                <Icon name="info" {...stylex.props(styles.errorIcon)} />
                <span>
                  No branches are available to record this against. Add a location before adjusting
                  stock.
                </span>
              </p>
            ) : (
              <>
                <SelectField
                  label="Branch"
                  labelHidden
                  size="chrome"
                  value={chosenBranch}
                  disabled={saving}
                  onChange={(event) => setChosenBranch(event.target.value)}
                  options={[
                    { value: '', label: 'Choose a branch…' },
                    ...locations.map((location) => ({ value: location.id, label: location.name })),
                  ]}
                />
                {branchMissing ? (
                  <p {...stylex.props(styles.hint)}>
                    A count is a claim about one shelf, so this adjustment has to name the branch it
                    changed.
                  </p>
                ) : null}
              </>
            )}
          </div>

          <div {...stylex.props(styles.onHandRow)}>
            <span {...stylex.props(styles.onHandLabel)}>
              {absolute ? `On hand at ${branchName}` : 'On hand, all branches'}
            </span>
            {stock === null ? (
              <Badge tone="neutral" label="Nothing recorded" />
            ) : (
              <Badge
                tone={stock === 0 ? 'danger' : 'pending'}
                label={stock === 0 ? 'Out of stock' : `${stock} left`}
              />
            )}
          </div>

          <div {...stylex.props(styles.stepperRow)}>
            <Button
              variant="secondary"
              size="card"
              iconOnly
              onClick={() => setAmount((value) => clamp(value - STEP))}
              disabled={(absolute && amount <= 0) || saving}
              icon={<Icon name="minus" {...stylex.props(styles.kitGlyph)} />}
              label="Decrease"
            />
            <input
              type="number"
              inputMode="numeric"
              min={absolute ? 0 : undefined}
              step={1}
              value={amount}
              disabled={saving}
              aria-label={absolute ? 'New on-hand count' : 'Change in units'}
              onChange={(event) => setAmount(clamp(event.target.valueAsNumber))}
              {...stylex.props(styles.countInput)}
            />
            <Button
              variant="secondary"
              size="card"
              iconOnly
              onClick={() => setAmount((value) => clamp(value + STEP))}
              disabled={saving}
              icon={<Icon name="plus" {...stylex.props(styles.kitGlyph)} />}
              label="Increase"
            />
          </div>

          <div {...stylex.props(styles.quickRow)}>
            {QUICK_ADDS.map((add) => (
              <button
                key={add}
                type="button"
                disabled={saving}
                onClick={() => setAmount((value) => clamp(value + add))}
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

          {/* Absolute mode lands on a number the operator can check against the
              shelf. Delta mode cannot — nobody here knows what the branch holds —
              so it previews the movement itself, and says what it moves. */}
          <p {...stylex.props(styles.preview)}>
            <Icon name="arrow" sw={2} {...stylex.props(styles.previewIcon)} />
            {absolute ? (
              <span>
                <span {...stylex.props(styles.previewTarget)}>{amount}</span> units at {branchName}
                {unchanged ? null : (
                  <span
                    {...stylex.props(styles.delta, delta > 0 ? styles.deltaUp : styles.deltaDown)}
                  >
                    ({delta > 0 ? '+' : ''}
                    {delta})
                  </span>
                )}
              </span>
            ) : (
              <span>
                <span
                  {...stylex.props(
                    styles.previewTarget,
                    delta > 0 ? styles.deltaUp : delta < 0 ? styles.deltaDown : undefined,
                  )}
                >
                  {delta > 0 ? '+' : ''}
                  {delta}
                </span>{' '}
                units at {branchMissing ? 'the branch you choose' : branchName}
                {stock === null ? null : (
                  <span {...stylex.props(styles.delta)}>
                    (all branches: {stock} → {stock + delta})
                  </span>
                )}
              </span>
            )}
          </p>

          {error !== null ? (
            <p role="alert" {...stylex.props(styles.error)}>
              <Icon name="info" {...stylex.props(styles.errorIcon)} />
              <span>{error}</span>
            </p>
          ) : null}
        </div>
      </Dialog>
    </>
  );
}
