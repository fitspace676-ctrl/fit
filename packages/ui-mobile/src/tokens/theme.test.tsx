// The gym accent rides the theme context: one prop on the provider repaints the
// accent roles in the active mode and leaves every other role alone.

import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { darkColors, lightColors } from './semantic';
import { ThemeProvider, useThemeColors, type ThemeAccent } from './theme';

const ACCENT: ThemeAccent = {
  light: { accent: '#9A7B00', onAccent: '#FFFFFF' },
  dark: { accent: '#FACC15', onAccent: '#131312' },
};

function Probe() {
  const c = useThemeColors();
  return <Text testID="probe">{[c.accent, c.onAccent, c.backgroundBody].join(' ')}</Text>;
}

const shown = () => String(screen.getByTestId('probe').props.children);

describe('ThemeProvider accent', () => {
  it('keeps the built-in accent without one', () => {
    render(
      <ThemeProvider scheme="light">
        <Probe />
      </ThemeProvider>,
    );
    expect(shown()).toBe(
      [lightColors.accent, lightColors.onAccent, lightColors.backgroundBody].join(' '),
    );
  });

  it('repaints only the accent roles, per mode', () => {
    const { rerender } = render(
      <ThemeProvider scheme="dark" accent={ACCENT}>
        <Probe />
      </ThemeProvider>,
    );
    expect(shown()).toBe(['#FACC15', '#131312', darkColors.backgroundBody].join(' '));
    rerender(
      <ThemeProvider scheme="light" accent={ACCENT}>
        <Probe />
      </ThemeProvider>,
    );
    expect(shown()).toBe(['#9A7B00', '#FFFFFF', lightColors.backgroundBody].join(' '));
  });
});
