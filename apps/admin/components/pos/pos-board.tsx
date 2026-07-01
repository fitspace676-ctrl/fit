'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePosCart } from '@/stores/pos-cart-store';
import type { PosMemberRow, PosProductRow } from '@/app/(dashboard)/pos/actions';
import { Card } from '@/components/ui';
import { MemberLookup } from './member-lookup';
import { PosCart } from './pos-cart';
import { PosPayment } from './pos-payment';
import { ProductGrid } from './product-grid';

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
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[3fr_2fr]">
      <Card className="min-h-0 p-4">
        <ProductGrid searchRef={productSearchRef} onAdd={onAdd} />
      </Card>
      <Card className="flex min-h-0 flex-col gap-3 p-4">
        <MemberLookup
          searchRef={memberSearchRef}
          selectedMember={selectedMember}
          onSelect={onSelectMember}
        />
        <div className="min-h-0 flex-1">
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
