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
 * The POS board — the tablet-optimised two-column terminal wiring the grid, the
 * member lookup, and the cart to the shared in-memory store. Left column
 * (8 of 12): product search + grid. Right column (4 of 12): the sticky cart
 * card, headed by the attached member (or the walk-in row, which opens the
 * member-lookup drawer).
 *
 * The attached member is held here as a full row (for display) and mirrored into
 * the store as just its `memberId` (the sale's source of truth). Keyboard
 * shortcuts are owned here so the focus targets and the clear action stay in one
 * place: `F1` focuses product search, `F2` opens the member lookup, `Esc`
 * dismisses the topmost overlay — or, with none open, clears the whole sale.
 */
export function PosBoard({ reconciliationHref }: { reconciliationHref: string | null }) {
  const addItem = usePosCart((state) => state.addItem);
  const setMember = usePosCart((state) => state.setMember);
  const clear = usePosCart((state) => state.clear);

  const [selectedMember, setSelectedMember] = useState<PosMemberRow | null>(null);
  const [isPaying, setIsPaying] = useState(false);
  const [isLookupOpen, setIsLookupOpen] = useState(false);
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
        setIsLookupOpen(true);
      } else if (event.key === 'Escape') {
        // Esc dismisses the topmost overlay first (payment, then the lookup
        // drawer); with nothing open it clears the whole sale — so an operator
        // never wipes a cart they meant to charge.
        if (isPaying) {
          setIsPaying(false);
        } else if (isLookupOpen) {
          setIsLookupOpen(false);
        } else {
          resetSale();
        }
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [resetSale, isPaying, isLookupOpen]);

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
      {/* LEFT — search + product grid */}
      <div className="space-y-4 lg:col-span-8">
        <ProductGrid
          searchRef={productSearchRef}
          onAdd={onAdd}
          onOpenLookup={() => setIsLookupOpen(true)}
          reconciliationHref={reconciliationHref}
        />
      </div>

      {/* RIGHT — the cart card, headed by the member / walk-in row */}
      <div className="lg:col-span-4">
        <Card glow className="flex flex-col lg:sticky lg:top-20">
          <MemberLookup
            searchRef={memberSearchRef}
            selectedMember={selectedMember}
            onSelect={onSelectMember}
            open={isLookupOpen}
            onOpenChange={setIsLookupOpen}
          />
          <PosCart onCharge={() => setIsPaying(true)} onClear={resetSale} />
        </Card>
      </div>

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
