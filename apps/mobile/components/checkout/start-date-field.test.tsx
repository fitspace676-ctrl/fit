// The join funnel's start-date week strip.
//
// What is worth pinning here is the WINDOW, because it is the only thing this
// control adds to the classes rail it is otherwise a copy of: a day the picker
// offers must be a day `isStartDateWithinPolicy` accepts, or the buyer fills in
// a whole form and is refused at `POST /auth/signup`. Both halves are asserted —
// what is offered, and what is refused — because a picker that offers nothing
// passes a one-sided test.

import type { GymStartDatePolicy } from '@fit/types';
import { fireEvent, type RenderResult } from '@testing-library/react-native';

import { StartDateField, type StartDateFieldProps } from './start-date-field';
import { renderScreen } from '../../test-support/render-screen';

/**
 * A node's `accessibilityState`, typed.
 *
 * `ReactTestInstance.props` is an index signature of `any`, so reaching two
 * levels into it is an `no-unsafe-member-access` error — and the state is
 * exactly what every assertion here is about.
 */
function a11y(
  view: Pick<RenderResult, 'getByTestId'>,
  testID: string,
): { disabled?: boolean; selected?: boolean } {
  const { props } = view.getByTestId(testID) as unknown as {
    props: { accessibilityState?: { disabled?: boolean; selected?: boolean } };
  };
  return props.accessibilityState ?? {};
}

/** A Wednesday, so the week on screen has three days behind it and four ahead. */
const TODAY = '2026-09-09';

const AHEAD: GymStartDatePolicy = { maxDaysAhead: 14, allowPast: false };

function field(props: Partial<StartDateFieldProps> = {}) {
  return renderScreen(
    <StartDateField
      testID="sd"
      label="Start date"
      value=""
      onChange={jest.fn()}
      policy={AHEAD}
      today={TODAY}
      invalid={false}
      disabled={false}
      {...props}
    />,
  );
}

describe('the window', () => {
  it('offers today and the days ahead, and refuses the ones behind', () => {
    const onChange = jest.fn();
    const view = field({ onChange });

    // Monday and Tuesday are this week, and both are behind today. `allowPast`
    // is off, so `startDateBounds` opens the window AT today.
    expect(a11y(view, 'sd-day-2026-09-07').disabled).toBe(true);
    expect(a11y(view, 'sd-day-2026-09-08').disabled).toBe(true);
    expect(a11y(view, 'sd-day-2026-09-09').disabled).toBe(false);
    expect(a11y(view, 'sd-day-2026-09-13').disabled).toBe(false);

    fireEvent.press(view.getByTestId('sd-day-2026-09-07'));
    expect(onChange).not.toHaveBeenCalled();

    // The `YYYY-MM-DD` the state contract is written in — unchanged by the move
    // off a masked text box.
    fireEvent.press(view.getByTestId('sd-day-2026-09-10'));
    expect(onChange).toHaveBeenCalledWith('2026-09-10');
  });

  it('opens the window backwards too when the gym allows backdating', () => {
    const view = field({ policy: { maxDaysAhead: 14, allowPast: true } });

    // `startDateBounds` reaches as far back as it reaches forward, so the whole
    // week on screen is inside a 14-day symmetric window.
    expect(a11y(view, 'sd-day-2026-09-07').disabled).toBe(false);
  });

  it('stops the chevrons where the window stops', () => {
    const view = field();

    // Nothing before today is on offer, so there is no previous week to visit.
    expect(a11y(view, 'sd-prev-week').disabled).toBe(true);
    // 14 days ahead of a Wednesday reaches into the week after next.
    expect(a11y(view, 'sd-next-week').disabled).toBe(false);

    fireEvent.press(view.getByTestId('sd-next-week'));
    expect(view.getByTestId('sd-day-2026-09-14')).toBeTruthy();
    expect(a11y(view, 'sd-prev-week').disabled).toBe(false);

    // 2026-09-23 is `TODAY + 14`, so the week of the 21st is the last one with
    // anything in it — the second half of it is already out — and there is no
    // week after that to page into.
    fireEvent.press(view.getByTestId('sd-next-week'));
    expect(a11y(view, 'sd-day-2026-09-23').disabled).toBe(false);
    expect(a11y(view, 'sd-day-2026-09-24').disabled).toBe(true);
    expect(a11y(view, 'sd-next-week').disabled).toBe(true);
  });

  it('offers only today when the gym starts everyone today', () => {
    const view = field({ policy: { maxDaysAhead: 0, allowPast: false } });

    expect(a11y(view, 'sd-day-2026-09-09').disabled).toBe(false);
    expect(a11y(view, 'sd-day-2026-09-10').disabled).toBe(true);
    expect(a11y(view, 'sd-prev-week').disabled).toBe(true);
    expect(a11y(view, 'sd-next-week').disabled).toBe(true);
  });
});

describe('what it says out loud', () => {
  // The cell shows "Wed" and "9". Read aloud that is an abbreviation and a bare
  // numeral — no month, no year, and no hint that the day cannot be chosen.
  it('spells the day out, names today, and says when a day is not on offer', () => {
    const view = field();

    expect(view.getByTestId('sd-day-2026-09-09').props.accessibilityLabel).toBe(
      'Today, Wednesday, September 9',
    );
    expect(view.getByTestId('sd-day-2026-09-07').props.accessibilityLabel).toBe(
      'Monday, September 7, Not available',
    );
  });

  it('opens on the buyer’s own answer rather than on this week', () => {
    const view = field({ value: '2026-09-21' });

    expect(a11y(view, 'sd-day-2026-09-21').selected).toBe(true);
    expect(view.queryByTestId('sd-day-2026-09-09')).toBeNull();
  });

  it('carries the window sentence, and turns it red once the buyer has tried to move on', () => {
    const quiet = field({ hint: 'Choose today or any day within the next 14 days.' });
    expect(quiet.getByTestId('sd-hint').props.accessibilityRole).toBeUndefined();
    quiet.unmount();

    const loud = field({ hint: 'Choose today or any day within the next 14 days.', invalid: true });
    expect(loud.getByTestId('sd-hint').props.accessibilityRole).toBe('alert');
  });
});

describe('a gym whose policy has not arrived', () => {
  // `startDateAccepted` still refuses the step, so the buyer cannot get past it
  // — but a strip with every cell dead would look broken rather than pending.
  it('bounds nothing rather than disabling everything', () => {
    const view = field({ policy: null, hint: undefined });

    expect(a11y(view, 'sd-day-2026-09-07').disabled).toBe(false);
    expect(a11y(view, 'sd-prev-week').disabled).toBe(false);
    expect(view.queryByTestId('sd-hint')).toBeNull();
  });
});

describe('while a request is in flight', () => {
  it('freezes every control without hiding one', () => {
    const view = field({ disabled: true });

    expect(a11y(view, 'sd-day-2026-09-09').disabled).toBe(true);
    expect(a11y(view, 'sd-next-week').disabled).toBe(true);
  });
});
