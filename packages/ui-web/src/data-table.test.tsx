// @vitest-environment jsdom
//
// Behaviour tests for the data-table kit (T9.6): sortable headers, row/all
// selection wiring, loading + empty states, the segmented FilterChips, and the
// TablePager's prev/next gating. These guard the interaction contract each list
// screen (members, orders, staff, shop) rebuilds against.

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import {
  DataTable,
  FilterChips,
  TablePager,
  TableSearch,
  type Column,
  type TableSelection,
} from './data-table';

interface Row {
  id: string;
  name: string;
  spend: number;
}

const rows: Row[] = [
  { id: 'a', name: 'Ada', spend: 120 },
  { id: 'b', name: 'Bo', spend: 80 },
];

const columns: Column<Row>[] = [
  { key: 'name', header: 'Name', sortKey: 'name', cell: (r) => r.name },
  { key: 'spend', header: 'Spend', sortKey: 'spend', align: 'right', cell: (r) => r.spend },
  { key: 'tag', header: 'Tag', cell: () => 'vip' }, // non-sortable (no sortKey)
];

function renderTable(props: Partial<Parameters<typeof DataTable<Row>>[0]> = {}) {
  return render(<DataTable rowKey={(r) => r.id} columns={columns} rows={rows} {...props} />);
}

describe('DataTable — sorting', () => {
  it('fires onSort with the column sortKey when a sortable header is clicked', () => {
    const onSort = vi.fn();
    renderTable({ onSort, sort: 'name', dir: 'asc' });

    fireEvent.click(screen.getByRole('button', { name: /spend/i }));
    expect(onSort).toHaveBeenCalledExactlyOnceWith('spend');
  });

  it('renders no sort button for a column without a sortKey', () => {
    renderTable({ onSort: vi.fn(), sort: 'name', dir: 'asc' });
    expect(screen.queryByRole('button', { name: /tag/i })).toBeNull();
  });

  it('does not make any header clickable when there is no onSort handler', () => {
    renderTable();
    // Headers still render as text, but none is a button.
    expect(screen.queryByRole('button', { name: /name/i })).toBeNull();
    expect(screen.getByText('Name')).toBeInTheDocument();
  });

  it('marks the active column with aria-sort and shows its direction arrow', () => {
    renderTable({ onSort: vi.fn(), sort: 'spend', dir: 'desc' });

    const activeHeader = screen.getByRole('columnheader', { name: /spend/i });
    expect(activeHeader).toHaveAttribute('aria-sort', 'descending');
    expect(within(activeHeader).getByText('▼')).toBeInTheDocument();

    const inactiveHeader = screen.getByRole('columnheader', { name: /name/i });
    expect(inactiveHeader).not.toHaveAttribute('aria-sort');
  });
});

describe('DataTable — selection', () => {
  function selection(overrides: Partial<TableSelection> = {}): TableSelection {
    return {
      selectedIds: new Set<string>(),
      allSelected: false,
      onToggle: vi.fn(),
      onToggleAll: vi.fn(),
      ...overrides,
    };
  }

  it('toggles a single row and reflects the selected state', () => {
    const onToggle = vi.fn();
    renderTable({ selection: selection({ selectedIds: new Set(['a']), onToggle }) });

    expect(screen.getByRole('checkbox', { name: 'Select row a' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select row b' })).not.toBeChecked();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select row b' }));
    expect(onToggle).toHaveBeenCalledExactlyOnceWith('b');
  });

  it('wires the header "select all" checkbox to onToggleAll', () => {
    const onToggleAll = vi.fn();
    renderTable({ selection: selection({ allSelected: true, onToggleAll }) });

    const selectAll = screen.getByRole('checkbox', { name: /select all rows on this page/i });
    expect(selectAll).toBeChecked();

    fireEvent.click(selectAll);
    expect(onToggleAll).toHaveBeenCalledOnce();
  });
});

describe('DataTable — loading & empty states', () => {
  it('draws the requested number of skeleton rows while loading (not the data)', () => {
    const { container } = renderTable({ loading: true, skeletonRows: 3 });
    expect(container.querySelectorAll('tbody tr')).toHaveLength(3);
    expect(screen.queryByText('Ada')).toBeNull();
  });

  it('shows the empty state when there are no rows and not loading', () => {
    render(<DataTable rowKey={(r: Row) => r.id} columns={columns} rows={[]} />);
    expect(screen.getByText('Nothing here yet')).toBeInTheDocument();
  });

  it('renders a custom empty node when provided', () => {
    render(
      <DataTable
        rowKey={(r: Row) => r.id}
        columns={columns}
        rows={[]}
        empty={<p>No members yet</p>}
      />,
    );
    expect(screen.getByText('No members yet')).toBeInTheDocument();
  });
});

describe('FilterChips', () => {
  const chips = [
    { label: 'All', value: '', count: 12 },
    { label: 'Active', value: 'active', count: 9 },
  ];

  it('marks the active chip and emits the value on select', () => {
    const onSelect = vi.fn();
    render(<FilterChips chips={chips} active="active" onSelect={onSelect} />);

    const active = screen.getByRole('tab', { name: /active/i });
    expect(active).toHaveAttribute('aria-selected', 'true');

    fireEvent.click(screen.getByRole('tab', { name: /all/i }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('');
  });
});

describe('TablePager', () => {
  it('disables Previous on the first page and advances on Next', () => {
    const onPageChange = vi.fn();
    render(
      <TablePager page={1} limit={20} total={45} onPageChange={onPageChange} noun="members" />,
    );

    expect(screen.getByText(/showing 1–20 of 45 members/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(onPageChange).toHaveBeenCalledExactlyOnceWith(2);
  });

  it('disables Next on the last page', () => {
    render(<TablePager page={3} limit={20} total={45} onPageChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /previous/i })).toBeEnabled();
  });
});

/**
 * The box is typed into locally and commits the query after a debounce; on every
 * list screen that commit is a URL change, so the committed value comes back as
 * `value` on the next render. That echo lands *after* the user has typed on, so
 * writing it into a focused box rewrites the field mid-word — the "it types and
 * deletes by itself" the roster search shipped with.
 */
describe('TableSearch', () => {
  it('keeps the trailing space the commit trimmed away', async () => {
    const onSearch = vi.fn();
    const { rerender } = render(<TableSearch value="" onSearch={onSearch} debounceMs={5} />);
    const input = screen.getByRole('searchbox');
    input.focus();

    fireEvent.change(input, { target: { value: 'Luka ' } });
    await waitFor(() => expect(onSearch).toHaveBeenCalledWith('Luka'));

    rerender(<TableSearch value="Luka" onSearch={onSearch} debounceMs={5} />);

    expect(input).toHaveValue('Luka ');
  });

  it('keeps the keystrokes typed while the commit was in flight', async () => {
    const onSearch = vi.fn();
    const { rerender } = render(<TableSearch value="" onSearch={onSearch} debounceMs={5} />);
    const input = screen.getByRole('searchbox');
    input.focus();

    fireEvent.change(input, { target: { value: 'Luka' } });
    await waitFor(() => expect(onSearch).toHaveBeenCalledWith('Luka'));

    // The user carries on typing while that round trip is still in flight…
    fireEvent.change(input, { target: { value: 'Luka Gel' } });
    // …and it lands, re-rendering with the value committed a keystroke ago.
    rerender(<TableSearch value="Luka" onSearch={onSearch} debounceMs={5} />);

    expect(input).toHaveValue('Luka Gel');
  });

  it('re-syncs from the source when the box is not being typed in', () => {
    const onSearch = vi.fn();
    const { rerender } = render(<TableSearch value="Luka" onSearch={onSearch} debounceMs={5} />);
    const input = screen.getByRole('searchbox');
    expect(input).toHaveValue('Luka');

    // The back button, or a "clear filters" control elsewhere on the page.
    rerender(<TableSearch value="" onSearch={onSearch} debounceMs={5} />);

    expect(input).toHaveValue('');
  });
});
