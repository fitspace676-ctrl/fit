'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { GymMemberIntakeSettings, GymPaymentMethods, GymReceiptSettings } from '@fit/types';
import { usePosCart } from '@/stores/pos-cart-store';
import {
  fetchPosLocationsAction,
  type PosLocationRow,
  type PosMemberRow,
  type PosMembershipRow,
  type PosProductRow,
} from '@/app/(dashboard)/pos/actions';
import { Card } from '@astryxdesign/core/Card';
import { MemberLookup } from './member-lookup';
import { PosCart } from './pos-cart';
import { PosPayment } from './pos-payment';
import { ProductGrid } from './product-grid';

const styles = stylex.create({
  grid: {
    display: 'grid',
    minHeight: 0,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    gap: '1rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 1024px)': '3fr 2fr',
    },
  },
  productPane: {
    minHeight: 0,
    padding: '1rem',
  },
  cartPane: {
    display: 'flex',
    minHeight: 0,
    flexDirection: 'column',
    gap: '0.75rem',
    padding: '1rem',
  },
  branchLabel: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.5rem',
    fontSize: '0.75rem',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
  },
  branchSelect: {
    height: '2.25rem',
    minWidth: '10rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: { default: 'var(--color-border)', ':focus': 'var(--color-accent)' },
    backgroundColor: 'var(--color-background-surface)',
    paddingInline: '0.5rem',
    fontFamily: 'inherit',
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--color-text-primary)',
    outlineStyle: 'none',
  },
  cartArea: {
    minHeight: 0,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
  },
});

/**
 * The POS board — the tablet-optimised two-column workspace wiring the grid, the
 * member lookup, and the cart to the shared in-memory store. Left column: product
 * search + grid. Right column: member lookup above the live cart.
 *
 * The attached member is held here as a full row (for display) and mirrored into
 * the store as just its `memberId` (the sale's source of truth). Keyboard shortcuts
 * are owned here so the focus targets (the two search boxes) and the clear action
 * stay in one place: `F1` focuses product search, `F2` the member lookup, `Esc`
 * clears the whole sale.
 *
 * `memberIntake` is threaded straight through to the lookup's add-member drawer — the
 * gym's Settings → Membership config, so registering at the till asks for exactly what
 * registering from the roster asks for. `null` for staff who cannot create members.
 *
 * `payments` is the gym's Settings → Payments config, threaded to the payment modal so
 * it offers only the settlement methods this gym accepts; `receipt` is its Settings →
 * Receipts config, deciding which hand-overs the confirmation screen then offers.
 */
export function PosBoard({
  memberIntake,
  payments,
  receipt,
}: {
  memberIntake: GymMemberIntakeSettings | null;
  payments: GymPaymentMethods;
  receipt: GymReceiptSettings;
}) {
  const addItem = usePosCart((state) => state.addItem);
  const setMember = usePosCart((state) => state.setMember);
  const clear = usePosCart((state) => state.clear);

  const setLocation = usePosCart((state) => state.setLocation);
  const locationId = usePosCart((state) => state.locationId);
  const [locations, setLocations] = useState<PosLocationRow[]>([]);

  const [selectedMember, setSelectedMember] = useState<PosMemberRow | null>(null);
  const [isPaying, setIsPaying] = useState(false);
  const productSearchRef = useRef<HTMLInputElement>(null);
  const memberSearchRef = useRef<HTMLInputElement>(null);

  // Load the gym's branches once and default to the first, so a single-site gym
  // never has to touch the selector and a multi-site one always attributes the sale.
  useEffect(() => {
    let cancelled = false;
    void fetchPosLocationsAction().then((result) => {
      if (cancelled || !result.ok) return;
      setLocations(result.data);
      if (result.data.length > 0) setLocation(result.data[0]!.id);
    });
    return () => {
      cancelled = true;
    };
  }, [setLocation]);

  const onAdd = useCallback(
    (product: PosProductRow) => {
      addItem({
        productId: product.id,
        name: product.name,
        unitPrice: product.priceAmount,
        currency: product.currency,
      });
    },
    [addItem],
  );

  /**
   * A membership line is keyed by its plan id and carries `planId`, which is what
   * tells the sale to enrol the attached member on that plan.
   */
  const onAddMembership = useCallback(
    (membership: PosMembershipRow) => {
      addItem({
        productId: membership.id,
        planId: membership.id,
        name: membership.name,
        unitPrice: membership.priceAmount,
        currency: membership.currency,
      });
    },
    [addItem],
  );

  const onSelectMember = useCallback(
    (member: PosMemberRow | null) => {
      setSelectedMember(member);
      setMember(member?.id);
    },
    [setMember],
  );

  const resetSale = useCallback(() => {
    clear();
    setSelectedMember(null);
    setIsPaying(false);
  }, [clear]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'F1') {
        event.preventDefault();
        productSearchRef.current?.focus();
      } else if (event.key === 'F2') {
        event.preventDefault();
        memberSearchRef.current?.focus();
      } else if (event.key === 'Escape') {
        // While the payment modal is open, Esc dismisses it; otherwise it clears
        // the whole sale (so an operator never wipes a cart they meant to charge).
        if (isPaying) {
          setIsPaying(false);
        } else {
          resetSale();
        }
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [resetSale, isPaying]);

  return (
    <div {...stylex.props(styles.grid)}>
      <Card variant="default" padding={0} xstyle={styles.productPane}>
        <ProductGrid searchRef={productSearchRef} onAdd={onAdd} onAddMembership={onAddMembership} />
      </Card>
      <Card variant="default" padding={0} xstyle={styles.cartPane}>
        {locations.length > 0 ? (
          <label {...stylex.props(styles.branchLabel)}>
            <span>Selling at</span>
            <select
              value={locationId ?? ''}
              onChange={(event) => setLocation(event.target.value || undefined)}
              {...stylex.props(styles.branchSelect)}
            >
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <MemberLookup
          searchRef={memberSearchRef}
          selectedMember={selectedMember}
          intake={memberIntake}
          onSelect={onSelectMember}
        />
        <div {...stylex.props(styles.cartArea)}>
          <PosCart onCharge={() => setIsPaying(true)} />
        </div>
      </Card>

      {isPaying ? (
        <PosPayment
          member={selectedMember}
          payments={payments}
          receipt={receipt}
          onClose={() => setIsPaying(false)}
          onCompleted={resetSale}
        />
      ) : null}
    </div>
  );
}
