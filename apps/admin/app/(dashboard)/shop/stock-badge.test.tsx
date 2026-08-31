// @fit/admin — the catalogue's stock badge under a branch filter (Stage 4).
//
// The catalogue is gym-wide and stays that way, so the number on this badge is a
// roll-up across every branch whatever the header switcher says. That is the
// quiet-lie risk of the whole stage in one component: "In stock · 12" beside a
// header reading "Riverside" has exactly one obvious reading, and it is wrong.
//
// The resolution pinned here is that the badge neither changes its number to suit
// the filter nor disappears under it — both would be a different lie — it names
// its own scope instead.

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StockBadge } from './stock-badge';

const row = { lowestStock: 4, totalStock: 12, lowStockThreshold: 5 };

describe('StockBadge', () => {
  it('says nothing about branches in All locations mode', () => {
    render(<StockBadge row={row} />);
    // Nothing to disambiguate: one figure, one meaning.
    expect(screen.queryByLabelText(/all branches/)).not.toBeInTheDocument();
  });

  it('names the roll-up when the console is scoped to a branch', () => {
    render(<StockBadge row={row} branchName="Riverside" />);
    expect(
      screen.getByLabelText('Low stock · 12 across all branches, not Riverside alone'),
    ).toBeInTheDocument();
  });

  it('keeps the count itself unchanged under a branch filter', () => {
    render(<StockBadge row={row} branchName="Riverside" />);
    // The number is the product's gym-wide total either way. Rewriting it to the
    // branch is impossible (the roster carries no per-branch figure) and faking it
    // would be worse than labelling it.
    expect(screen.getByText(/12/)).toBeInTheDocument();
  });

  it('labels an untracked product without inventing a count', () => {
    render(
      <StockBadge
        row={{ lowestStock: null, totalStock: 0, lowStockThreshold: null }}
        branchName="Riverside"
      />,
    );
    expect(
      screen.getByLabelText('Untracked across all branches, not Riverside alone'),
    ).toBeInTheDocument();
  });
});
