import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ComboboxField, type ComboboxFieldProps } from './combobox-field';
import { Dialog } from './dialog';
import { chooseOption, selectedValue } from './testing';

const options = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
  { value: 'g', label: 'Gamma' },
];
const labels = { search: 'Search options', empty: 'Nothing found' };
function Field(props: Partial<ComboboxFieldProps>) {
  return <ComboboxField label="Location" labels={labels} options={options} {...props} />;
}
function activeOption(element: HTMLElement) {
  return document.getElementById(element.getAttribute('aria-activedescendant') ?? '');
}

describe('ComboboxField', () => {
  it('binds the label to the trigger and shows the selected label or placeholder', () => {
    const { rerender } = render(<Field value="b" />);
    expect(screen.getByLabelText('Location')).toHaveTextContent('Beta');
    expect(screen.getByLabelText('Location')).toHaveAttribute('role', 'combobox');
    rerender(<Field value="" placeholder="Choose a location" />);
    expect(screen.getByLabelText('Location')).toHaveTextContent('Choose a location');
  });

  it('dispatches a native select change, closes and restores focus', async () => {
    const user = userEvent.setup();
    const changed = vi.fn();
    render(
      <Field
        onChange={(event) => {
          changed(event.target.value);
        }}
      />,
    );
    const trigger = screen.getByLabelText('Location');
    await user.click(trigger);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: 'Beta' }));
    expect(changed).toHaveBeenCalledExactlyOnceWith('b');
    expect(selectedValue(trigger)).toBe('b');
    expect(trigger).toHaveTextContent('Beta');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('preserves defaultValue and FormData, including the helper contract', async () => {
    const user = userEvent.setup();
    render(
      <form aria-label="Form">
        <Field name="location" defaultValue="g" />
      </form>,
    );
    const trigger = screen.getByLabelText('Location');
    expect(trigger).toHaveTextContent('Gamma');
    await chooseOption(user, trigger, /Beta/);
    expect(new FormData(screen.getByRole<HTMLFormElement>('form')).get('location')).toBe('b');
  });

  it('supports controlled values and direct native change events', async () => {
    function Controlled() {
      const [value, setValue] = useState('a');
      return <Field value={value} onChange={(event) => setValue(event.target.value)} />;
    }
    const user = userEvent.setup();
    render(<Controlled />);
    const trigger = screen.getByLabelText('Location');
    await chooseOption(user, trigger, 'Gamma');
    expect(trigger).toHaveTextContent('Gamma');
    fireEvent.change(trigger.parentElement!.querySelector('select')!, { target: { value: 'b' } });
    expect(trigger).toHaveTextContent('Beta');
  });

  it('renders named groups and marks the selected option', async () => {
    const user = userEvent.setup();
    render(<Field options={[{ label: 'Cities', options }]} defaultValue="b" />);
    await user.click(screen.getByLabelText('Location'));
    const group = screen.getByRole('group', { name: 'Cities' });
    const selected = within(group).getByRole('option', { name: 'Beta' });
    expect(selected).toHaveAttribute('aria-selected', 'true');
    expect(selected.querySelector('svg')).toBeInTheDocument();
    expect(within(group).getByRole('option', { name: 'Alpha' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it.each([
    { count: 3, searchable: 'auto' as const, expected: false },
    { count: 8, searchable: 'auto' as const, expected: true },
    { count: 3, searchable: true, expected: true },
    { count: 8, searchable: false, expected: false },
    { count: 7, searchable: 'auto' as const, expected: false },
  ])(
    'search visibility: $count options, searchable=$searchable',
    async ({ count, searchable, expected }) => {
      const user = userEvent.setup();
      render(
        <Field
          searchable={searchable}
          placeholder="Choose"
          options={Array.from({ length: count }, (_, index) => ({
            value: String(index),
            label: `Option ${index}`,
          }))}
        />,
      );
      await user.click(screen.getByLabelText('Location'));
      expect(Boolean(screen.queryByRole('searchbox'))).toBe(expected);
      expect(expected ? screen.getByRole('searchbox') : screen.getByRole('listbox')).toHaveFocus();
    },
  );

  it('filters labels and group labels case-insensitively, including Georgian', async () => {
    const user = userEvent.setup();
    render(
      <Field
        searchable
        options={[
          { label: 'Cities', options },
          {
            label: 'საქართველო',
            options: [
              { value: 't', label: 'თბილისი' },
              { value: 'k', label: 'ქუთაისი' },
            ],
          },
        ]}
      />,
    );
    await user.click(screen.getByLabelText('Location'));
    const search = screen.getByRole('searchbox');
    await user.type(search, '  bETA ');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option')).toHaveTextContent('Beta');
    await user.clear(search);
    await user.type(search, 'CITIES');
    expect(screen.getAllByRole('option')).toHaveLength(3);
    await user.clear(search);
    await user.type(search, 'თბილისი');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    await user.clear(search);
    await user.type(search, 'საქართველო');
    expect(screen.getAllByRole('option')).toHaveLength(2);
    await user.clear(search);
    await user.type(search, 'missing');
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    expect(screen.getByText(labels.empty)).toBeInTheDocument();
  });

  it('navigates, selects with Enter and closes with Escape', async () => {
    const user = userEvent.setup();
    render(<Field searchable />);
    const trigger = screen.getByLabelText('Location');
    trigger.focus();
    await user.keyboard('{ArrowDown}');
    const search = screen.getByRole('searchbox');
    expect(activeOption(search)).toHaveTextContent('Alpha');
    await user.keyboard('{ArrowDown}');
    expect(activeOption(search)).toHaveTextContent('Beta');
    await user.keyboard('{ArrowUp}');
    expect(activeOption(search)).toHaveTextContent('Alpha');
    await user.keyboard('{End}');
    expect(activeOption(search)).toHaveTextContent('Gamma');
    await user.keyboard('{Home}');
    expect(activeOption(search)).toHaveTextContent('Alpha');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(trigger).toHaveTextContent('Beta');
    expect(trigger).toHaveFocus();
    await user.keyboard('{ArrowUp}{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('supports typeahead without search and skips disabled options', async () => {
    const user = userEvent.setup();
    render(<Field options={[...options, { value: 'x', label: 'Blocked', disabled: true }]} />);
    await user.click(screen.getByLabelText('Location'));
    const list = screen.getByRole('listbox');
    await user.keyboard('ga');
    expect(activeOption(list)).toHaveTextContent('Gamma');
    await user.keyboard('{ArrowDown}');
    expect(activeOption(list)).toHaveTextContent('Alpha');
    await user.click(screen.getByRole('option', { name: 'Blocked' }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(selectedValue(screen.getByLabelText('Location'))).toBe('a');
  });

  it('does not open a disabled field', async () => {
    const user = userEvent.setup();
    render(<Field disabled />);
    await user.click(screen.getByLabelText('Location'));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('does not focus the hidden native select when its Dialog opens', () => {
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: 52,
      right: 240,
      width: 240,
      height: 52,
      toJSON: () => ({}),
    });
    try {
      render(
        <Dialog open onClose={() => {}} title="Edit">
          <Field />
        </Dialog>,
      );
      expect(screen.getByLabelText('Location')).toHaveFocus();
    } finally {
      rect.mockRestore();
    }
  });

  it('anchors the portal to the trigger and flips it on viewport changes', async () => {
    const user = userEvent.setup();
    render(<Field />);
    const trigger = screen.getByLabelText('Location');
    const rect = vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
      x: 20,
      y: 50,
      top: 50,
      left: 20,
      bottom: 102,
      right: 320,
      width: 300,
      height: 52,
      toJSON: () => ({}),
    });
    await user.click(trigger);
    const panel = screen.getByRole('listbox').parentElement!;
    expect(panel.parentElement).toBe(document.body);
    expect(panel).toHaveStyle({ top: '106px', left: '20px', width: '300px' });
    rect.mockReturnValue({
      x: 20,
      y: 650,
      top: 650,
      left: 20,
      bottom: 702,
      right: 320,
      width: 300,
      height: 52,
      toJSON: () => ({}),
    });
    fireEvent.resize(window);
    expect(panel.style.top).toBe('');
    expect(panel.style.bottom).toBe(`${window.innerHeight - 650 + 4}px`);
    rect.mockRestore();
  });

  it('keeps the parent Dialog open for portal pointer presses and the first Escape', async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    render(
      <Dialog open onClose={close} title="Edit">
        <Field searchable />
      </Dialog>,
    );
    await user.click(screen.getByLabelText('Location'));
    await user.click(screen.getByRole('searchbox'));
    expect(close).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(close).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    expect(close).toHaveBeenCalledOnce();
  });

  it('dismisses only the top layer on an outside press', async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    render(
      <Dialog open onClose={close} title="Edit">
        <Field />
      </Dialog>,
    );
    await user.click(screen.getByLabelText('Location'));
    await user.click(document.body);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Location')).toHaveFocus();
  });

  it('Tabs naturally from the field in both directions', async () => {
    const user = userEvent.setup();
    render(
      <>
        <button>Before</button>
        <Field searchable />
        <button>After</button>
      </>,
    );
    const trigger = screen.getByLabelText('Location');
    await user.click(trigger);
    // user-event computes Tab's destination from the original event target,
    // whereas the browser uses the focus moved by the keydown handler.
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Tab' });
    await user.tab();
    expect(screen.getByRole('button', { name: 'After' })).toHaveFocus();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    await user.click(trigger);
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Tab', shiftKey: true });
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Before' })).toHaveFocus();
  });

  it('forwards blur, required invalid focus and the native ref', async () => {
    const user = userEvent.setup();
    const blur = vi.fn();
    const ref = { current: null as HTMLSelectElement | null };
    render(
      <>
        <Field required placeholder="Choose" onBlur={blur} ref={ref} />
        <button>After</button>
      </>,
    );
    const trigger = screen.getByLabelText('Location');
    expect(ref.current).toBe(trigger.parentElement!.querySelector('select'));
    expect(ref.current?.value).toBe('');
    fireEvent.invalid(ref.current!);
    expect(trigger).toHaveFocus();
    await user.tab();
    expect(blur).toHaveBeenCalledOnce();
  });

  it('restores the uncontrolled default on form reset', async () => {
    const user = userEvent.setup();
    render(
      <form>
        <Field defaultValue="b" />
        <button type="reset">Reset</button>
      </form>,
    );
    const trigger = screen.getByLabelText('Location');
    await chooseOption(user, trigger, 'Gamma');
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    expect(trigger).toHaveTextContent('Beta');
    expect(selectedValue(trigger)).toBe('b');
  });
});
