import { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { chooseOption, selectedValue } from '@fit/ui-kit/testing';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@fit/i18n/locales/en.json';
import { TimingField, timingState, timingOffset, validTiming, timingLabel } from './timing-field';

function Harness({ offset = '0d', event = false }: { offset?: string; event?: boolean }) {
  const [value, setValue] = useState(() => timingState(offset, event));
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <TimingField value={value} event={event} onChange={setValue} />
      <output>{validTiming(value) ? timingOffset(value) : 'invalid'}</output>
    </NextIntlClientProvider>
  );
}

describe('TimingField', () => {
  it('edits a legacy scan preset into a custom five-day offset', async () => {
    const user = userEvent.setup();
    render(<Harness offset="7_days_before" />);
    expect(selectedValue(screen.getByLabelText('Direction'))).toBe('before');
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '5' } });
    expect(screen.getByRole('status')).toHaveTextContent('-5d');
    await chooseOption(user, screen.getByLabelText('Unit'), 'hours');
    expect(screen.getByRole('status')).toHaveTextContent('-5h');
    cleanup();
  });
  it('normalizes a negative event seed and excludes before presets and direction', async () => {
    const user = userEvent.setup();
    render(<Harness offset="2_days_before" event />);
    expect(selectedValue(screen.getByLabelText('Direction'))).toBe('now');
    await user.click(screen.getByLabelText('Direction'));
    expect(screen.getByRole('option', { name: 'After' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Before' })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
    await user.click(screen.getByLabelText('Quick preset'));
    expect(screen.getByRole('option', { name: '3 days after' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: '7 days before' })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
    await chooseOption(user, screen.getByLabelText('Quick preset'), '3 days after');
    expect(screen.getByRole('status')).toHaveTextContent('3d');
    cleanup();
  });
  it('rejects empty, fractional, negative and excessive amounts, allowing boundaries', () => {
    for (const [unit, max] of [
      ['d', 365],
      ['h', 8760],
    ] as const) {
      for (const amount of ['', '-1', '1.5', String(max + 1)]) {
        expect(
          validTiming({ timingAmount: amount, timingUnit: unit, timingDirection: 'after' }),
        ).toBe(false);
      }
      for (const amount of ['0', String(max)]) {
        expect(
          validTiming({ timingAmount: amount, timingUnit: unit, timingDirection: 'before' }),
        ).toBe(true);
      }
    }
  });
  it('formats legacy and custom offsets using dynamic translation keys', () => {
    const t = (key: string, values?: Record<string, string | number>) =>
      `${key}:${JSON.stringify(values)}`;
    expect(timingLabel('day_of', t)).toBe('timing.now:undefined');
    expect(timingLabel('-5h', t)).toContain('timing.before:');
    expect(timingLabel('1_day_after', t)).toContain('timing.after:');
  });
});
