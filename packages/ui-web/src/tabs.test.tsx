// @vitest-environment jsdom
//
// Behaviour tests for the tab bar's accessibility (T9.8): the tablist follows
// the WAI-ARIA roving-tabindex pattern (only the active tab is in the tab
// order) and Arrow / Home / End move focus + selection between tabs.

import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { Tabs, type TabItem } from './tabs';

const ITEMS: TabItem[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'activity', label: 'Activity' },
  { value: 'billing', label: 'Billing' },
];

describe('Tabs — ARIA structure', () => {
  it('exposes a labelled tablist of tabs with the active one selected', () => {
    render(<Tabs items={ITEMS} aria-label="Sections" defaultValue="activity" />);
    const tablist = screen.getByRole('tablist', { name: 'Sections' });
    expect(tablist).toBeInTheDocument();
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
  });

  it('keeps only the active tab in the tab order (roving tabindex)', () => {
    render(<Tabs items={ITEMS} defaultValue="overview" />);
    const [first, second, third] = screen.getAllByRole('tab');
    expect(first).toHaveAttribute('tabindex', '0');
    expect(second).toHaveAttribute('tabindex', '-1');
    expect(third).toHaveAttribute('tabindex', '-1');
  });
});

describe('Tabs — keyboard navigation', () => {
  it('ArrowRight moves selection + focus to the next tab and wraps at the end', () => {
    const onValueChange = vi.fn();
    render(<Tabs items={ITEMS} defaultValue="overview" onValueChange={onValueChange} />);
    const tabs = screen.getAllByRole('tab');

    fireEvent.keyDown(tabs[0]!, { key: 'ArrowRight' });
    expect(onValueChange).toHaveBeenLastCalledWith('activity');
    expect(document.activeElement).toBe(tabs[1]);

    fireEvent.keyDown(tabs[1]!, { key: 'ArrowRight' });
    fireEvent.keyDown(tabs[2]!, { key: 'ArrowRight' });
    // Past the last tab wraps back to the first.
    expect(onValueChange).toHaveBeenLastCalledWith('overview');
    expect(document.activeElement).toBe(tabs[0]);
  });

  it('ArrowLeft wraps from the first tab to the last', () => {
    const onValueChange = vi.fn();
    render(<Tabs items={ITEMS} defaultValue="overview" onValueChange={onValueChange} />);
    const tabs = screen.getAllByRole('tab');
    fireEvent.keyDown(tabs[0]!, { key: 'ArrowLeft' });
    expect(onValueChange).toHaveBeenLastCalledWith('billing');
    expect(document.activeElement).toBe(tabs[2]);
  });

  it('Home and End jump to the first and last tab', () => {
    const onValueChange = vi.fn();
    render(<Tabs items={ITEMS} defaultValue="activity" onValueChange={onValueChange} />);
    const tabs = screen.getAllByRole('tab');

    fireEvent.keyDown(tabs[1]!, { key: 'End' });
    expect(onValueChange).toHaveBeenLastCalledWith('billing');
    expect(document.activeElement).toBe(tabs[2]);

    fireEvent.keyDown(tabs[2]!, { key: 'Home' });
    expect(onValueChange).toHaveBeenLastCalledWith('overview');
    expect(document.activeElement).toBe(tabs[0]);
  });

  it('leaves the selection untouched for unrelated keys', () => {
    const onValueChange = vi.fn();
    render(<Tabs items={ITEMS} defaultValue="overview" onValueChange={onValueChange} />);
    const tabs = screen.getAllByRole('tab');
    fireEvent.keyDown(tabs[0]!, { key: 'a' });
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('honours a controlled value — Arrow keys report intent without owning state', () => {
    function Controlled() {
      const [value, setValue] = useState('overview');
      return <Tabs items={ITEMS} value={value} onValueChange={setValue} />;
    }
    render(<Controlled />);
    const tabs = screen.getAllByRole('tab');
    fireEvent.keyDown(tabs[0]!, { key: 'ArrowRight' });
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
  });
});
