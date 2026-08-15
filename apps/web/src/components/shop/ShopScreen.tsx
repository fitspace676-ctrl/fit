'use client';

import { useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { CartView } from '@fit/types';
import { CartPanel } from './CartPanel';
import { ShopBrowser } from './ShopBrowser';

// FormaCore redesign — the shop as catalogue + cart, side by side.
//
// The cart state lives here rather than in either child because both of them
// change it: the plus on a catalogue row and the stepper on a panel line are the
// same mutation seen from two places. Every cart server action returns the fresh
// cart, so a mutation anywhere hands the new view up to this one owner and both
// columns re-render from it — no `router.refresh()`, no second read, and no way
// for the row count and the panel to disagree.

const styles = stylex.create({
  layout: {
    display: 'grid',
    alignItems: 'start',
    gap: '1.5rem',
    gridTemplateColumns: {
      default: 'minmax(0, 1fr)',
      '@media (min-width: 1024px)': 'minmax(0, 1fr) 20.5rem',
    },
  },
});

export interface ShopScreenProps {
  /** Active gym id, or `null` when no tenant is in scope (apex / preview). */
  gymId: string | null;
  /** The member's cart as of the request, so the panel renders filled. */
  initialCart: CartView;
}

/** The shop screen: the gym's catalogue with the live cart beside it. */
export function ShopScreen({ gymId, initialCart }: ShopScreenProps) {
  const [cart, setCart] = useState<CartView>(initialCart);

  return (
    <div {...stylex.props(styles.layout)}>
      <ShopBrowser gymId={gymId} cart={cart} onCart={setCart} />
      <CartPanel cart={cart} onCart={setCart} />
    </div>
  );
}
