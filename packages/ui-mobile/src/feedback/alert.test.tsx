// The advisory layer's a11y contract, which is the whole of what it owes.
//
// The visual is four rows of a lookup table and a border width; the thing that
// can be wrong without anyone noticing is WHEN the alert interrupts, and
// whether the box announces once or four times.

import { render, screen } from '@testing-library/react-native';
import { Text as RNText } from 'react-native';

import { darkColors } from '../tokens/semantic';

import { Alert, InlineNote } from './alert';

function flatten(style: unknown): Record<string, unknown> {
  if (Array.isArray(style))
    return Object.assign({}, ...style.map(flatten)) as Record<string, unknown>;
  if (style && typeof style === 'object') return style as Record<string, unknown>;
  return {};
}

describe('Alert', () => {
  it('announces the alert role', () => {
    render(<Alert title="Premium 8 დღეში სრულდება" testID="a" />);
    expect(screen.getByTestId('a').props.accessibilityRole).toBe('alert');
  });

  // ==========================================================================
  // A LIVE REGION INTERRUPTS. A standing advisory that carries one is
  // re-announced on every re-render of the screen around it, which is why
  // this is opt-in and named for the condition rather than defaulted on.
  // ==========================================================================
  it('is not a live region by default', () => {
    render(<Alert title="გაუქმების ვადა 2 საათია" testID="a" />);
    expect(screen.getByTestId('a').props.accessibilityLiveRegion).toBeUndefined();
  });

  it('becomes a polite live region when it appeared in response to an action', () => {
    render(<Alert title="ბარათი უარყოფილია" live testID="a" />);
    expect(screen.getByTestId('a').props.accessibilityLiveRegion).toBe('polite');
  });

  it('is one announcement, not one per line', () => {
    render(<Alert title="სათაური" body="ტექსტი" testID="a" />);
    expect(screen.getByTestId('a').props.accessible).toBe(true);
  });

  // ...but a collapsed subtree has no focusable descendants, so an alert with
  // something pressable in it must NOT be collapsed.
  it('un-collapses the moment it holds children a finger can land on', () => {
    render(
      <Alert title="სათაური" testID="a">
        <RNText>action</RNText>
      </Alert>,
    );
    expect(screen.getByTestId('a').props.accessible).toBeUndefined();
  });

  it('renders the title without a body', () => {
    render(<Alert title="მხოლოდ სათაური" testID="a" />);
    expect(screen.getByText('მხოლოდ სათაური')).toBeTruthy();
  });

  it('paints the danger tone from the red roles, not from a literal', () => {
    render(<Alert title="ვერ ჩაიტვირთა" tone="danger" testID="a" />);
    const style = flatten(screen.getByTestId('a').props.style);
    expect(style.backgroundColor).toBe(darkColors.backgroundRed);
    expect(style.borderColor).toBe(darkColors.borderRed);
  });

  it('rounds at the container rung', () => {
    render(<Alert title="x" testID="a" />);
    expect(flatten(screen.getByTestId('a').props.style).borderRadius).toBe(26);
  });
});

describe('InlineNote', () => {
  it('announces the alert role and carries no shell', () => {
    render(<InlineNote testID="n">გაუქმება უფასოა 2 საათამდე.</InlineNote>);
    const style = flatten(screen.getByTestId('n').props.style);
    expect(screen.getByTestId('n').props.accessibilityRole).toBe('alert');
    expect(style.backgroundColor).toBeUndefined();
    expect(style.borderWidth).toBeUndefined();
  });

  it('is one announcement — the glyph is paint', () => {
    render(<InlineNote testID="n">ტექსტი</InlineNote>);
    expect(screen.getByTestId('n').props.accessible).toBe(true);
  });

  it('takes the live region on request, like Alert', () => {
    render(
      <InlineNote testID="n" live>
        ტექსტი
      </InlineNote>,
    );
    expect(screen.getByTestId('n').props.accessibilityLiveRegion).toBe('polite');
  });
});
