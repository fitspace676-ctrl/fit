import { describe, expect, it } from 'vitest';
import { consoleThemeCss } from './console-theme';

describe('consoleThemeCss', () => {
  // No choice means no override: the console keeps the theme's own colour.
  it('is null when the gym chose no colour', () => {
    expect(consoleThemeCss(null)).toBeNull();
  });

  it('paints the chosen colour onto the theme scope, as a fill and as type', () => {
    const css = consoleThemeCss('#dc2626');
    expect(css).toMatch(/^\[data-astryx-theme='formacore'\]\{.*\}$/);
    expect(css).toContain('--color-accent:#DC2626;');
    expect(css).toContain('--color-text-accent:');
    expect(css).toContain('--color-icon-accent:');
  });

  // The ink on the fill follows the fill, the same way it does on the member
  // portal: white on a deep red, near-black on a pale pink.
  it('picks legible ink for the button text', () => {
    expect(consoleThemeCss('#991b1b')).toContain('--color-on-accent:#FFFFFF;');
    expect(consoleThemeCss('#f9a8d4')).toContain('--color-on-accent:#131312;');
    // The default sky blue, saved explicitly, keeps white labels like the theme.
    expect(consoleThemeCss('#1A7FD6')).toContain('--color-on-accent:#FFFFFF;');
  });

  it('writes nothing for a value that is not a six-digit hex', () => {
    expect(consoleThemeCss('red')).toBeNull();
    expect(consoleThemeCss('#fff')).toBeNull();
  });
});
