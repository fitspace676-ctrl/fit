// Render tests for `Segmented`'s two-line option — the join funnel's package
// tabs, where "სავარჯიშო პაკეტები" was cut to "სავარჯიშო პ…".

import { render, screen } from '@testing-library/react-native';

import { Segmented } from './segmented';

function flatten(style: unknown): Record<string, unknown> {
  if (Array.isArray(style))
    return Object.assign({}, ...style.map(flatten)) as Record<string, unknown>;
  if (style && typeof style === 'object') return style as Record<string, unknown>;
  return {};
}

const OPTIONS = [
  { value: 'a', label: 'აბონემენტები' },
  { value: 'c', label: 'სავარჯიშო პაკეტები' },
] as const;

describe('Segmented', () => {
  it('draws one-line labels in a 44pt track by default', () => {
    render(<Segmented label="ტიპი" value="a" onChange={jest.fn()} options={OPTIONS} testID="s" />);
    expect(flatten(screen.getByTestId('s').props.style).height).toBe(44);
    expect(screen.getByText('სავარჯიშო პაკეტები').props.numberOfLines).toBe(1);
  });

  it('wraps a long label onto two lines in a 64pt track with `labelLines={2}`', () => {
    render(
      <Segmented
        label="ტიპი"
        value="a"
        onChange={jest.fn()}
        options={OPTIONS}
        labelLines={2}
        testID="s"
      />,
    );
    expect(flatten(screen.getByTestId('s').props.style).height).toBe(64);
    expect(screen.getByText('სავარჯიშო პაკეტები').props.numberOfLines).toBe(2);
    expect(flatten(screen.getByTestId('s-c').props.style).height).toBe(56);
  });
});
