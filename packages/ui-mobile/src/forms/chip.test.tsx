// Render tests for `Chip`'s two opt-in layouts. Every existing rail passes
// neither prop, so the defaults are pinned as firmly as the new behaviour.

import { render, screen } from '@testing-library/react-native';

import { themeColors } from '../tokens/semantic';

import { Chip } from './chip';

const dark = themeColors(true);

function flatten(style: unknown): Record<string, unknown> {
  if (Array.isArray(style))
    return Object.assign({}, ...style.map(flatten)) as Record<string, unknown>;
  if (style && typeof style === 'object') return style as Record<string, unknown>;
  return {};
}

describe('Chip', () => {
  it('keeps its intrinsic width by default', () => {
    render(<Chip label="ყველა" onPress={jest.fn()} testID="c" />);
    const style = flatten(screen.getByTestId('c').props.style);
    expect(style.flexShrink).toBe(0);
    expect(style.flex).toBeUndefined();
  });

  it('takes an equal share of the row with `stretch`', () => {
    render(<Chip label="დეტალები" stretch onPress={jest.fn()} testID="c" />);
    const style = flatten(screen.getByTestId('c').props.style);
    expect(style.flex).toBe(1);
    expect(style.minWidth).toBe(0);
    expect(style.height).toBe(44);
  });

  it('dims a disabled chip by default', () => {
    render(<Chip label="პაკეტი" disabled onPress={jest.fn()} testID="c" />);
    expect(flatten(screen.getByTestId('c').props.style).backgroundColor).toBe(
      dark.borderEmphasized,
    );
    expect(flatten(screen.getByText('პაკეტი').props.style).color).toBe(dark.textDisabled);
  });

  it('keeps a readable label when `disabledLook="readable"`, still disabled', () => {
    render(<Chip label="პაკეტი" disabled disabledLook="readable" onPress={jest.fn()} testID="c" />);
    const node = screen.getByTestId('c');
    expect(node.props.accessibilityState).toMatchObject({ disabled: true });
    expect(flatten(node.props.style).backgroundColor).toBe(dark.backgroundCard);
    expect(flatten(screen.getByText('პაკეტი').props.style).color).toBe(dark.textSecondary);
  });
});
