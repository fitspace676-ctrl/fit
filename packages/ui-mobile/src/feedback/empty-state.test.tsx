// EmptyState — including, per plan item G-05, the ERROR state.
//
// The branch worth testing is the one that is easy to get wrong by being
// helpful: an empty state with no action must render NO button, not a
// disabled one and not a default one. A screen that has nothing to offer says
// so with silence; a dead button is a promise that does not resolve.

import { fireEvent, render, screen } from '@testing-library/react-native';

import { EmptyState } from './empty-state';

const HIDDEN = { includeHiddenElements: true } as const;

function flatten(style: unknown): Record<string, unknown> {
  if (Array.isArray(style))
    return Object.assign({}, ...style.map(flatten)) as Record<string, unknown>;
  if (style && typeof style === 'object') return style as Record<string, unknown>;
  return {};
}

describe('EmptyState', () => {
  it('renders no button at all when no action is given', () => {
    render(<EmptyState title="დღეს გაკვეთილები არ არის" body="სცადეთ სხვა დღე." testID="e" />);
    expect(screen.getByText('დღეს გაკვეთილები არ არის')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders exactly one button when an action is given, and calls it', () => {
    const onPress = jest.fn();
    render(
      <EmptyState
        title="შენი კალათა ცარიელია"
        action={{ label: 'პროდუქტების დათვალიერება', onPress, testID: 'e-action' }}
        testID="e"
      />,
    );
    expect(screen.getAllByRole('button')).toHaveLength(1);
    fireEvent.press(screen.getByTestId('e-action'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders no medallion without an icon', () => {
    render(<EmptyState title="x" testID="e" layout="bare" />);
    // Bare, no icon, no body, no action: the title is the only child.
    expect(screen.getByTestId('e', HIDDEN).children).toHaveLength(1);
  });

  // ==========================================================================
  // G-05. No artboard draws a failed load, so the error state IS this
  // component with a different glyph and a retry. That is a claim worth an
  // assertion, because the alternative — a toast — auto-dismisses, and a
  // member who looks up four seconds late sees an empty screen and no reason.
  // ==========================================================================
  it('is the error state too: a glyph, a reason and a working retry', () => {
    const onRetry = jest.fn();
    render(
      <EmptyState
        icon="info"
        title="ვერ ჩაიტვირთა"
        body="შეამოწმე კავშირი და სცადე ხელახლა."
        action={{ label: 'ხელახლა', onPress: onRetry, testID: 'e-retry' }}
        testID="e"
      />,
    );
    fireEvent.press(screen.getByTestId('e-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('does not fire a retry that is already in flight', () => {
    const onRetry = jest.fn();
    render(
      <EmptyState
        title="ვერ ჩაიტვირთა"
        action={{ label: 'ხელახლა', onPress: onRetry, busy: true, testID: 'e-retry' }}
        testID="e"
      />,
    );
    fireEvent.press(screen.getByTestId('e-retry'));
    expect(onRetry).not.toHaveBeenCalled();
  });

  // ==========================================================================
  // The two layouts differ on a shell, the padding and the button height —
  // the three things that are actually load-bearing when this sits inside a
  // sheet, which is already a panel.
  // ==========================================================================
  it('wraps in a panel by default and in nothing when bare', () => {
    const panel = render(<EmptyState title="x" testID="p" />);
    expect(flatten(panel.getByTestId('p').props.style).backgroundColor).toBeDefined();
    expect(flatten(panel.getByTestId('p').props.style).paddingVertical).toBe(48);
    panel.unmount();

    const bare = render(<EmptyState title="x" layout="bare" testID="b" />);
    const style = flatten(bare.getByTestId('b').props.style);
    expect(style.backgroundColor).toBeUndefined();
    expect(style.paddingVertical).toBe(40);
    expect(style.paddingHorizontal).toBe(0);
  });

  it('steps the button up to the sheets 52pt height when bare', () => {
    const panel = render(
      <EmptyState title="x" action={{ label: 'a', onPress: jest.fn(), testID: 'pa' }} testID="p" />,
    );
    expect(flatten(panel.getByTestId('pa').props.style).height).toBe(44);
    panel.unmount();

    const bare = render(
      <EmptyState
        title="x"
        layout="bare"
        action={{ label: 'a', onPress: jest.fn(), testID: 'ba' }}
        testID="b"
      />,
    );
    expect(flatten(bare.getByTestId('ba').props.style).height).toBe(52);
  });
});
