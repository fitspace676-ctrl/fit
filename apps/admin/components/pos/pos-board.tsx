'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { usePosCart } from '@/stores/pos-cart-store';
import type { PosMemberRow, PosProductRow } from '@/app/(dashboard)/pos/actions';
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
 */
export function PosBoard() {
  const addItem = usePosCart((state) => state.addItem);
  const setMember = usePosCart((state) => state.setMember);
  const clear = usePosCart((state) => state.clear);

  const [selectedMember, setSelectedMember] = useState<PosMemberRow | null>(null);
  const [isPaying, setIsPaying] = useState(false);
  const productSearchRef = useRef<HTMLInputElement>(null);
  const memberSearchRef = useRef<HTMLInputElement>(null);

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
        <ProductGrid searchRef={productSearchRef} onAdd={onAdd} />
      </Card>
      <Card variant="default" padding={0} xstyle={styles.cartPane}>
        <MemberLookup
          searchRef={memberSearchRef}
          selectedMember={selectedMember}
          onSelect={onSelectMember}
        />
        <div {...stylex.props(styles.cartArea)}>
          <PosCart onCharge={() => setIsPaying(true)} />
        </div>
      </Card>

      {isPaying ? (
        <PosPayment
          member={selectedMember}
          onClose={() => setIsPaying(false)}
          onCompleted={resetSale}
        />
      ) : null}
    </div>
  );
}
